/*eslint no-console: 0, no-unused-vars: 0*/
"use strict";

var https = require("https");
var port = process.env.PORT || 3000;
var server = require("http").createServer();

var xsenv = require("@sap/xsenv");
var passport = require("passport");
var xssec = require("@sap/xssec");
//var xsHDBConn = require("@sap/hdbext");
var express = require("express");
var xsjs = require("@sap/xsjs");

https.globalAgent.options.ca = xsenv.loadCertificates();
global.__base = __dirname + "/";
global.__uaa = process.env.UAA_SERVICE_NAME;

//logging
var logging = require("@sap/logging");
var appContext = logging.createAppContext();

//Initialize Express App for XS UAA and HDBEXT Middleware
var app = express();

//Compression
app.use(require("compression")({
	threshold: "1b"
}));

//Helmet for Security Policy Headers
const helmet = require("helmet");

app.use(helmet());
app.use(helmet.contentSecurityPolicy({
	directives: {
		defaultSrc: ["'self'"],
		styleSrc: ["'self'", "sapui5.hana.ondemand.com"],
		scriptSrc: ["'self'", "sapui5.hana.ondemand.com"]
	}
}));
// Sets "Referrer-Policy: no-referrer".
app.use(helmet.referrerPolicy({
	policy: "no-referrer"
}));

//Build a JWT Strategy from the bound UAA resource
passport.use("JWT", new xssec.JWTStrategy(xsenv.getServices({
	uaa: {
		tag: "xsuaa"
	}
}).uaa));

//Add XS Logging to Express
app.use(logging.middleware({
	appContext: appContext,
	logNetwork: true
}));

//Add Passport JWT processing
app.use(passport.initialize());

var hanaOptions = xsenv.getServices({
	hana: {
		tag: "hana"
	}
});

hanaOptions.hana.pooling = true;
//Add Passport for Authentication via JWT + HANA DB connection as Middleware in Expess
app.use(
	passport.authenticate("JWT", {
		session: false
	})/*,
	xsHDBConn.middleware(hanaOptions.hana)*/
);

app.get('/getUserInfo', function (req, res, next) {

	let body = JSON.stringify({
		"userId": req.user.id,
		"lastName": req.user.name.familyName,
		"firstName": req.user.name.givenName,
		"email": req.user.emails
	});
	return res.type("application/json").status(200).send(body);
});

var options = {
	//anonymous: true, // remove to authenticate calls
	auditLog: {
		logToConsole: true
	},
	redirectUrl: "/index.xsjs",
	xsApplicationUser: false,
	context: {
		base: global.__base,
		env: process.env,
		answer: 42
	}
};

//configure HANA
try {
	options = Object.assign(options, xsenv.getServices({
		hana: {
			tag: "hana"
		}
	}));
	options = Object.assign(options, xsenv.getServices({
		secureStore: {
			tag: "hana"
		}
	}));
} catch (err) {
	console.log("[WARN]", err.message);
}

//Add SQLCC
try {
	options.hana.sqlcc = xsenv.getServices({
		"xsjs.sqlcc_config": "CROSS_SCHEMA_LOCATIONS"
	});
} catch (err) {
	console.log("[WARN]", err.message);
}

// configure UAA
try {
	options = Object.assign(options, xsenv.getServices({
		uaa: {
			tag: "xsuaa"
		}
	}));
} catch (err) {
	console.log("[WARN]", err.message);
}

// start server
var xsjsApp = xsjs(options);
app.use(xsjsApp);

//Start the Server 
server.on("request", app);
server.listen(port, function () {
	console.info(`HTTP Server: ${server.address().port}`);
});