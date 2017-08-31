#!/usr/bin/env node

var Xray = require('x-ray');
var x = Xray();
var Hashids = require('hashids');
var hashids = new Hashids('mrpoopybutthole', 10, 'abcdefghijklmnopqrstuvwxyz1234567890');
var moment = require('moment');
var async = require('async');
var json2csv = require('json2csv');

function getAirtableRecords(callback) {
	var records = [];

	base('Domains').select({
		view: "Grid view"
	}).eachPage(function page(airTableRecords, fetchNextPage) {
		airTableRecords.forEach(function (record) {
			records.push({
				recordId: record.id,
				title: record.get('title'),
				word: record.get('word'),
				meaning: record.get('meaning'),
				example: record.get('example'),
				available: record.get('available'),
				dateChecked: record.get('dateChecked')
			});
		});
		fetchNextPage();
	}, function done(err) {
		if (err) {
			return callback(err);
		}

		return callback(null, records);
	});
}

function scrapeDictionary(records, callback) {
	var domains = [];

	x('http://www.urbandictionary.com/', '.def-panel', [{
			title: '.word',
			word: '.word',
			meaning: '.meaning',
			example: '.example'
		}])
		.paginate('#content > div.pagination-centered > ul > li:nth-child(7) > a@href')
		.limit(80)(function (err, domains) {
			if (err) {
				return callback(err);
			}

			for (var i = 0; i < domains.length; i++) {
				// Create domain
				// convert word to domainable string
				domains[i].title = domains[i].title.replace(/[^A-Za-z]/g, '').toLowerCase() + '.com';
				domains[i].available = 'is taken';
			}

			callback(null, records, domains);
		});
}

function mergeRecords(records, domains, callback) {
	domains.forEach(function (domain) {
		var found = records.find(function (record) {
			return domain.title == record.title;
		});
		if (found == undefined) {
			console.log("New domain: " + domain.title);
			records.push(domain);
		}
	});

	records.map(function(record) {
		record.count = records.length;
	})

	callback(null, records);
}

function writeToFile(words, callback) {
	try {
		var result = json2csv({
			data: words
		});

		require('fs').writeFile('./file.csv', result, function (err) {
			if (err) return callback(err);
		});
	} catch (err) {
		callback(err);
	}
}

async.waterfall([
	getAirtableRecords,
	scrapeDictionary,
	mergeRecrds,
	writeToFile
], function (err, words) {
	if (err) {
		console.log(`Something went wrong: ${err}`);
	}
});
