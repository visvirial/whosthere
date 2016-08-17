whosthere
=========

What
----

This simple program scans LAN network using `arp-scan` command and
monitor what devices is connected or disconnected to the network.

If there are some activity, a message will be sent to a Slack channel.

How
---

Just copy `config.example.json` to `config.json` and edit it.

Make sure `arp-scan` is installed.
If you want to launch this script by non-root users, please add SUID to `arp-scan` command:
```
$ sudo chmod u+s /usr/bin/arp-scan
```

Then, run the main script:

```
$ npm start
```





