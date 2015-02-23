var chalk = require("chalk")
var gpsd = require("node-gpsd")
var pcap = require("pcap")
var net = require("net")
var fs = require("fs")
var exec = require("child_process").execSync

var WIFI_PROBE_FILTER = "wlan type mgt subtype probe-req"

var gps
var gpsData = []

module.exports = function(config) {
  var api = require("./api.js")(config.server)

  function addTPV(tpv) {
    tpv.date = new Date()
    gpsData.push(tpv)
    if (gpsData.length > 20)
      gpsData.shift()
  }

  var port = config.server.slice(":")[1]
  var host = config.server.slice(":")[0]

  /* GPSd setup */

  gps = new gpsd.Listener({
    port: config.gpsd_port,
    hostname: "localhost",
    parse: true
  })

  gps.connect(function() {
    console.log("connected to gpsd")
    gps.watch()
  })

  gps.on("error.connection", function() {
    console.error("connection error, failed to start. Maybe GPS is down.")
    process.exit(1)
  })

  gps.on("error.socket", function() {
    console.error("GPSd socket error")
  })

  gps.on("TPV", function(data) {
    if (typeof data !== "undefined")
      addTPV(data)
  })

  /* WiFi sniffing */
  exec("ip link set " + config.interface + " up")

  if (!fs.existsSync("/sys/class/net/mon0"))
    exec("iw dev " + config.interface + " interface add mon0 type monitor flags none")
  
  exec("ip link set mon0 up")

  var session = pcap.createSession("mon0", WIFI_PROBE_FILTER)
  session.on("packet", function(raw) {
    var packet = pcap.decode.packet(raw)
    //console.log(JSON.stringify(packet, null, 2))

    var data = {}
    data.type = "wifi"
    data.tracking_data = {}

    if (packet.payload && packet.payload.ieee802_11Frame) {
      var frame = packet.payload.ieee802_11Frame
      
      // format MAC address as string (vs. array)
      data.tracking_data.shost = frame.shost.addr
        .map(function(n) { return n.toString("16") })
        .join(":")

      // extract ssid
      if (frame.probe.tags.length > 0) {
        frame.probe.tags.forEach(function(tag) {
          if (tag.ssid)
            data.tracking_data.ssid = tag.ssid
        })
      }
    }

    var lastGps = gpsData[gpsData.length - 1]
    var timeDiff = (Date.now() - lastGps.date) / 1000


    // only transmit data if GPS is available!
    if (lastGps) {
      if (timeDiff < 4) {
        data.lat = lastGps.lat
        data.lon = lastGps.lon
        data.alt = lastGps.alt
        data.epx = lastGps.epx
        data.epy = lastGps.epy
        data.epv = lastGps.epv
        data.speed = lastGps.speed
        data.climb = lastGps.climb

        api.postData(data, function(err, res) {
          if (err) console.error(chalk.red("error: server might be down... "), err)
        })
      }
      else {
        console.log(chalk.red("warning: ") + "GPS data outdated")
      }
    }
  })
}

// clean up
process.on("SIGINT", function() {
  exec("iw dev mon0 del")
  gps.disconnect()
})
