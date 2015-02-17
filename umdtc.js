var chalk = require("chalk")
var gpsd = require("node-gpsd")
var api = require("./api")

module.exports = function(config) {
  var gpsData = []
  function addTPV(tpv) {
    gpsData.push(tpv)
    if (gpsData.length > 20)
      gpsData.shift()
  }

  var gps = new gpsd.Listener({
    port: config.gpsd_port,
    hostname: "localhost",
    parse: true
  })

  gps.connect(function() {
    console.log("connected to gpsd")
    gps.watch()
  })

  gps.on("disconnected", function() {
    console.log("disconnected... reconnecting")
    gps.connect()
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
}
