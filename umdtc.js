var chalk = require("chalk")
var gpsd = require("node-gpsd")
var pcap = require("pcap")
var net = require("net")
var fs = require("fs")
var exec = require("child_process").execSync

var WIFI_PROBE_FILTER = "wlan type mgt subtype probe-req"
var captureDevice = "mon0" // default

function GpsStore() {
  this.tpvs = []
}

GpsStore.prototype = {
  add: function(tpv) {
    tpv.date = new Date()
    this.tpvs.push(tpv)
    if (gpsData.length > 20)
      this.tpvs.shift() // remove first (oldest) element
  },
  get: function(i) {
    if (!i) {
      return this.tpvs[this.tpvs.length - 1]
    }
    else {
      return this.tpvs[i]
    }
  }
}

var gps // GPS device
var gpsData = new GpsStore()

module.exports = function(config) {
  var api = require("./api.js")(config.server)

  if (!process.env.UMDTC_DEBUG) {
    process.on("uncaughtException", function (err) {
      console.log("exception: " + err)
      // just don't crash
    })
  }

  var host = config.server.slice(":")[0]
  var port = config.server.slice(":")[1]

  /* GPSd setup */

  if (!config.fixed_pos) {
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

    /*
     * TPV = "time-position-velocity report"
     * It includes all GPS data that is useful to umdt :)
     * mode = 2 means 2d fix, mode = 3 3d.
     * 3d fix means vertical data / altitude
     * */

    gps.on("TPV", function(data) {
      if (typeof data !== "undefined" && (data.mode === 2 || data.mode === 3)) // 2d or 3d fix
        gpsData.add(data)
    })
  }

  // always try to bring the interface up first
  exec("ip link set " + config.interface + " up")

  var ifInfo = exec("ip link show " + config.interface).toString()

  if (/link\/ieee802.11/.test(ifInfo)) {
    if (!(/link\/ieee802.11\/radiotap/).test(ifInfo)) {
      console.log("Error: this won't work, only radiotap monitor interfaces do :(")
      process.exit(1)
    }
    // When the interface passed through the flags is actually in monitor mode, use it.
    captureDevice = config.interface
  }
  else {
    if (!fs.existsSync("/sys/class/net/mon0")) {
      exec("iw dev " + config.interface + " interface add " + captureDevice + " type monitor flags none")
      exec("ip link set " + captureDevice + " up")
    }
  }

  var session = pcap.createSession(captureDevice, WIFI_PROBE_FILTER)

  session.on("packet", function(raw) {
    var packet = pcap.decode.packet(raw)

    var data = {}
    data.type = "wifi"
    data.tracking_data = {}

    if (packet.payload && packet.payload.ieee802_11Frame) {
      if (packet.payload.frequency) {
        data.tracking_data.frequency = packet.payload.frequency
      }

      var frame = packet.payload.ieee802_11Frame
      
      // format MAC address as string (vs. array)
      data.tracking_data.shost = frame.shost.addr
        .map(function(n) { return n.toString("16") })
        .join(":")

      // extract ssid
      if (frame.probe.tags.length > 0) {
        frame.probe.tags.forEach(function(tag) {
          if (tag.type === "ssid" && tag.ssid) {
            data.tracking_data.ssid = tag.ssid
          }

          if (tag.type === "rates" && tag.value) {
            var rates = []
            for (var i = 0; i < tag.value.length; i++) {
              rates.push(tag.value[i])
            }
            data.tracking_data.rates = rates
          }

          if (tag.type === "extended_rates" && tag.value) {
            var extended_rates = []
            for (var i = 0; i < tag.value.length; i++) {
              extended_rates.push(tag.value[i])
            }

            data.tracking_data.extended_rates = extended_rates
          }

          if (tag.type === "channel" && tag.value) {
            if (tag.value.length > 0) 
              data.tracking_data.channel = tag.value[0]
          }

          // TODO collect other types of data:
          // * HT capabilities
          // * WPS
          // * extended capabilities
          // * other vendor-specific stuff
        })
      }
    }

    if (!config.fixed_pos && !config.discard) {
      var lastFix = gpsData.get()

      // only transmit data if GPS is available!
      if (lastFix) {
        var timeDiff = (Date.now() - lastFix.date) / 1000

        var maxTimeDiff = 4
        if (config.gps_timeout)
          maxTimeDiff = config.gps_timeout

        if (timeDiff < maxTimeDiff) {
          data.lat = lastFix.lat
          data.lon = lastFix.lon
          data.alt = lastFix.alt
          data.epx = lastFix.epx
          data.epy = lastFix.epy
          data.epv = lastFix.epv
          data.speed = lastFix.speed
          data.climb = lastFix.climb

          if (config.log) {
            console.log(JSON.stringify(data))
          }


          if (!config.discard) {
            api.postData(data, function(err, res) {
              if (err) console.error(chalk.red("error: server might be down... "), err)
            })
          }
        }
        else {
          console.log(chalk.red("warning: ") + "GPS data outdated by " + timeDiff + " seconds")
        }
      }
    }
    else {
      // Fixed position
      data.lat = config.lat
      data.lon = config.lon
      data.alt = 0
      data.epx = 0
      data.epy = 0
      data.epv = 0
      data.speed = 0
      data.climb = 0

      if (config.log) {
        console.log(JSON.stringify(data))
      }

      if (!config.discard) {
        api.postData(data, function(err, res) {
          if (err) console.error(chalk.red("error: server might be down... "), err)
        })
      }
    }
  })
}

// clean up
process.on("SIGINT", function() {
  if (captureDevice === "mon0") 
    exec("iw dev mon0 del")
  if (gps)
    gps.disconnect()
  process.exit(1)
})
