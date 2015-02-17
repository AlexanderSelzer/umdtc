UMDTc - Unified Mobile Device Tracker client
--------

## Requirements

* GPSd should be started and listening on the port.
* WiFi drivers that don't suck

## GPSd

It it doesn't work, and you use Arch, edit `/etc/gpsd.conf` and add the GPS USB device to DEVICES, that it looks like this or so:
```
DEVICES="ttyACM0"
```
Then restart/start gpsd (`systemctl restart gpsd`)

Otherwise, use the command `sudo gpsd /dev/ttyACM0`

## Info

Can't get rid of the monitor interface after the program crashed? `sudo iw mon0 del`

[http://www.catb.org/gpsd/gpsd_json.html](http://www.catb.org/gpsd/gpsd_json.html)


