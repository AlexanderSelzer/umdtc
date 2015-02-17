var chalk = require("chalk")
var gpsd = require("node-gpsd")
var pcap = require("pcap")
var exec = require("child_process").execSync

var WIFI_PROBE_FILTER = "wlan type mgt subtype probe-req"

var gps
var gpsData = []

module.exports = function(config) {
  var api = require("./api.js")(config.server)

  function getLastGps() {
    return gpsData[gpsData.length - 1]
  }

  function addTPV(tpv) {
    gpsData.push(tpv)
    if (gpsData.length > 20)
      gpsData.shift()
  }

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
    process.exit(1)
  })

  gps.on("TPV", function(data) {
    addTPV(data)
  })

  /* WiFi sniffing */
  exec("ip link set " + config.interface + " up")
  exec("iw dev " + config.interface + " interface add mon0 type monitor flags none")
  exec("ip link set mon0 up")

  var session = pcap.createSession("mon0", WIFI_PROBE_FILTER)
  session.on("packet", function(raw) {
    var packet = pcap.decode.packet(raw)

    var data = {}
    data.type = "wifi"
    data.tracking_data = {}

    if (packet.payload && packet.payload.ieee802_11Frame) {
      var frame = packet.payload.ieee802_11Frame
      
      data.tracking_data.shost = frame.shost.addr
    }

    var lastGps = getLastGps()
    data.lat = lastGps.lat
    data.lon = lastGps.lon
    data.alt = lastGps.alt
    data.epx = lastGps.epx
    data.epy = lastGps.epy
    data.epv = lastGps.epv
    data.speed = lastGps.speed
    data.climb = lastGps.climb

    api.postData(data, function(err, res) {
      console.log(err, res)
    })
  })
}

// clean up
process.on("SIGINT", function() {
  exec("iw dev mon0 del")
  gps.disconnect()
})
