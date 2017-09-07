#!/usr/bin/env node

require('dotenv').config();
var Xray = require('x-ray');
var x = Xray();
var Hashids = require('hashids');
var hashids = new Hashids('mrpoopybutthole', 10, 'abcdefghijklmnopqrstuvwxyz1234567890');
var moment = require('moment');
var async = require('async');
var json2csv = require('json2csv');
var Airtable = require('airtable');
Airtable.configure({
	endpointUrl: 'https://api.airtable.com',
	apiKey: process.env.AIRTABLE_API_KEY
});
var base = Airtable.base(process.env.AIRTABLE_BASE_ID);

function getAirtableRecords(callback) {
	console.log("Get airtable records.");
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
			return callback(`Something went wrong getting records: ${err}`);
		}

		return callback(null, records);
	});
}

function scrapeDictionary(records, callback) {
	console.log("Scrape dictionary.");
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
	records.forEach(function (record) {
		// Find matching domain
		domains.forEach(function (domain) {
			if (record.title == domain.title) {
				console.log("Merging record: " + record.title);
				record.word = domain.word;
			}
		});
	});

	callback(null, records);
}

function writeToFile(records, callback) {
	try {
		console.log("Write records to file.");
		var result = json2csv({
			data: records
		});

		require('fs').writeFile('./file.csv', result, function (err) {
			if (err) return callback(err);
		});
	} catch (err) {
		callback(err);
	}
}

function updateAirtableRecords(records, callback) {
	async.each(records, function (record, eachCallback) {
		base('Domains').update(record.recordId, {
			"word": record.word
		}, function (err, record) {
			if (err) {
				return eachCallback(err);
			}
			eachCallback();
		});
	}, function (err) {
		if (err) {
			return callback(err);
		}
		callback(null, records);
	});
}

async.waterfall([
	getAirtableRecords,
	scrapeDictionary,
	mergeRecords,
	updateAirtableRecords
], function (err, words) {
	if (err) {
		console.log(`Something went wrong: ${err}`);
	}
});
