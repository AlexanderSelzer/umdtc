var http = require("http")

var api = function(server) {
  return {
    postData: function(data, cb) {
      var json = JSON.stringify(data)
      console.log("posting to" + server)

      var options = {
        hostname: server.split(":")[0],
        port: server.split(":")[1],
        method: "POST",
        path: "/data",
        headers: {
          "Content-Type": "application/json",
          "Content-length": json.length
        }
      }
      var request = http.request(options, function(res) {
        cb(null, res)
      })
      request.on("error", function(err) {
        cb(err, null)
      })
      request.write(json)
      request.end()
    }
  }
}

module.exports = api
