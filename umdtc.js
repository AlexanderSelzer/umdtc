var chalk = require("chalk")
var gpsd = require("node-gpsd")
var pcap = require("pcap")
var api = require("./api")
var exec = require("child_process").execSync

var gps
var gpsData = []

module.exports = function(config) {
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

  var session = pcap.createSession("mon0")
  session.on("packet", function(packet) {
    console.log(packet)
  })
}

// clean up
process.on("SIGINT", function() {
  exec("iw dev mon0 del")
  gps.disconnect()
})
