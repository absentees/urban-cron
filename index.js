#!/usr/bin/env node

// require('babel-polyfill');
require('dotenv').config();
var Xray = require('x-ray');
var x = Xray();
var Hashids = require('hashids');
var hashids = new Hashids('mrpoopybutthole', 10, 'abcdefghijklmnopqrstuvwxyz1234567890');
var moment = require('moment');
var async = require('async');
var domainr = require('domainr-api');
var domainrApi = new domainr(process.env.DOMAINR_API);
var Airtable = require('airtable');
Airtable.configure({
	endpointUrl: 'https://api.airtable.com',
	apiKey: process.env.AIRTABLE_API_KEY
});
var base = Airtable.base(process.env.AIRTABLE_BASE_ID);
var axios = require('axios');

function getAirtableRecords(callback) {
	var records = [];

	base('Domains').select({
		view: "Grid view"
	}).eachPage(function page(airTableRecords, fetchNextPage) {
		airTableRecords.forEach(function (record) {
			records.push({
				recordId: record.id,
				title: record.get('title'),
				meaning: record.get('meaning'),
				example: record.get('example'),
				available: record.get('available'),
				dateChecked: record.get('dateChecked')
			});
		});
		fetchNextPage();

	}, function done(err) {
		if (err) {
			console.log(`Something went wrong getting records: ${err}`);
		}

		return callback(null, records);
	});
}

function scrapeDictionary(records, callback) {
	x('http://www.urbandictionary.com/', '.def-panel', [{
			title: '.word',
			word: '.word',
			meaning: '.meaning',
			example: '.example'
		}])
		.paginate('#content > div.pagination-centered > ul > li:nth-child(7) > a@href')
		.limit(75)(function (err, domains) {
			if (err) {
				console.log(err);
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

function checkDomains(domains, callback) {

	async.each(domains, function (domain, callback) {
		domainrApi
			.status([domain.title])
			.then(res => {
				console.log('Domain status: ' + domain.title + ' ' + res[0].summary);

				switch (res[0].summary) {
				case 'inactive':
					domain.available = "is available";
					break;
				case 'marketed':
					domain.available = "is for sale"
					break;
				case 'priced':
					domain.available = "is for sale"
					break;
				}
				domain.dateChecked = moment().format("MMMM Do YYYY, HH:mm:ss Z");
				callback();
			})
			.catch(err => {
				console.log(err)
				callback();
			});
	}, function (err) {
		if (err) {
			console.log(err);
		}

		callback(null, domains);
	});
}

function setIds(words, callback) {
	for (var i = 0; i < words.length; i++) {
		words[i].hashId = i;
	}

	callback(null, words);
}

function writeToJson(words, callback) {
	jsonfile.writeFile(file, words, {
		spaces: 2
	}, function (err) {
		if (err) {
			console.error(err);
		}
	});
}

function updateAirtable(domains, callback) {
	console.log('Uploading domains to Airtable');

	async.each(domains, function (domain, callback) {
		console.log('Uploading domain: ' + domain.title);

		if (domain.recordId == undefined) {
			// New record
			base('Domains').create({
				'title': domain.title,
				'word': domain.word,
				'meaning': domain.meaning,
				'example': domain.example,
				'available': domain.available,
				'dateChecked': domain.dateChecked,
				'count': domain.count
			}, function (err, record) {
				if (err) {
					console.log(`Something went wrong creating record: ${err}`);
				}

				callback();
			});
		} else {
			base('Domains').update(domain.recordId, {
				'title': domain.title,
				'meaning': domain.meaning,
				'example': domain.example,
				'available': domain.available,
				'dateChecked': domain.dateChecked,
				'count': domain.count
			}, function (err, record) {
				if (err) {
					console.log(`Something went wrong updating record: ${err}`);
				}

				callback();
			});
		}
	}, function (err) {
		if (err) {
			console.log(err);
		}

		callback(null);
	});
}

function publishSite(callback) {
	console.log("Publishing site.");

	axios.post(process.env.URBAN_NETLIFY_DEPLOY_HOOK).then((res) => {
		callback(null);
	}).catch((err) => {
		callback(err);
	});
}

async.waterfall([
	getAirtableRecords,
	scrapeDictionary,
	mergeRecords,
	checkDomains,
	updateAirtable,
	publishSite
], function (err, words) {
	if (err) {
		console.log(`Something went wrong: ${err}`);
	}
});
