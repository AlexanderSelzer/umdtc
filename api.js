var http = require("http")

/* umdt server API client */

var api = function(server) {
  return {
    postData: function(data, cb) {
      var json = JSON.stringify(data)

      var options = {
        hostname: server.split(":")[0],
        port: server.split(":")[1],
        method: "POST",
        path: "/api/data",
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
