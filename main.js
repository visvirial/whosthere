
var dns = require('dns');
var async = require('async');
var exec = require('child_process').exec;
var Slack = require('slack-node');
var moment = require('moment');
var sprintf = require('sprintf-js').sprintf;

var config = require('./config.json');

var slack = new Slack();
slack.setWebhook(config.slack.endpoint);

/**
 * Scan network and return connected nodes as a callback parameter.
 * Returned node list is formatted as follows:
 *   {
 *     'MAC_ADDR1': {
 *       owner  : {
 *         label: 'LABEL',
 *         icon: 'ICON_IMAGE_URL',
 *       },
 *       label  : 'LABEL',
 *       ip     : 'IP_ADDRESS',
 *       product: 'PRODUCT',
 *     },
 *     'MAC_ADDR2': { ... },
 *     ...
 *   }
 */
var list_nodes = function(cb) {
	exec('arp-scan -l | head -n-3 | tail -n+3', function(err, stdout, stderr) {
		if(err) {
			console.err('E: failed to execute arp-scan');
			return;
		}
		var lines = stdout.split('\n');
		lines.pop();
		var nodes = {};
		async.each(lines, function(line, cb2) {
			var a = line.split('\t');
			var ip = a[0];
			var mac = a[1];
			var product = a[2];
			if(config.nodes[mac]) {
				nodes[mac] = config.nodes[mac];
			} else {
				nodes[mac] = {
					owner: 'unknown',
					label: 'Unknown Device',
				};
			}
			nodes[mac].user = config.users[nodes[mac].owner];
			nodes[mac].mac = mac;
			nodes[mac].ip = ip;
			nodes[mac].product = product;
			dns.reverse(ip, function(err, hostname) {
				if(!err) nodes[mac].hostname = hostname;
				cb2();
			});
		}, function(err) {
			cb(nodes);
		});
	});
};

/**
 * Send notification to Slack.
 */
var slack_notify = function(node, type) {
	var message = node.label + ' ' + (type=='connect' ? 'が接続しました' : 'が切断しました');
	console.log('[' + new Date().toString() + '] ' + message);
	var text = sprintf(
		'%1$s\n%2$s / <http://%3$s/|%3$s> / %4$s',
		moment().format('YYYY/MM/DD HH:mm:ss.SS'),
		node.hostname,
		node.ip,
		node.mac);
	slack.webhook({
		channel: config.slack.channel,
		username: node.user.label,
		icon_emoji: node.user.icon,
		attachments: [{
			fallback: message,
			color: (type=='connect' ? 'good' : 'danger'),
			text: node.label,
			footer: text,
		}],
	}, function(err, res) {
	});
};

/** The list of currently connected nodes. */
var current_nodes = {};

/**
 * Send connected node list to Slack.
 */
var slack_list = function() {
	var nodes = [];
	for(var n in current_nodes) {
		nodes.push(current_nodes[n]);
	}
	nodes.sort(function(a, b) {
		return a.owner.localeCompare(b.owner);
	});
	var text = '';
	nodes.forEach(function(n) {
		text += sprintf('[%s] %s\n', n.user.label, n.label);
	});
	slack.webhook({
		channel: config.slack.channel,
		username: 'whosthere',
		icon_emoji: ':grey_question:',
		attachments: [{
			fallback: text,
			color: 'grey',
			pretext: '接続一覧',
			text: text,
		}],
	}, function(err, res) {
	});
};

/**
 * Check current nodes repeatedly, and print the results.
 */
var check_nodes = function(isFirst) {
	list_nodes(function(nodes) {
		var changed = false;
		// Explorer currently connected nodes.
		for(var mac in nodes) {
			if(current_nodes[mac] == undefined) {
				if(!isFirst) slack_notify(nodes[mac], 'connect');
				changed = true;
			}
			current_nodes[mac] = nodes[mac];
			current_nodes[mac].last_seen = new Date().getTime();
		}
		// Search for disconnected nodes.
		for(var mac in current_nodes) {
			if(new Date().getTime() - current_nodes[mac].last_seen > config.threshold_time) {
				if(!isFirst) slack_notify(current_nodes[mac], 'disconnect');
				changed = true;
				delete current_nodes[mac];
			}
		}
		if(changed) slack_list();
		setTimeout(check_nodes, config.serach_interval);
	});
};

// Launch main loop.
check_nodes(true);

