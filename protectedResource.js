var express = require("express");
var url = require("url");
var bodyParser = require('body-parser');
var randomstring = require("randomstring");
var cons = require('consolidate');
var nosql = require('nosql').load('database.nosql');
var qs = require("qs");
var querystring = require('querystring');
var request = require("sync-request");
var __ = require('underscore');
var base64url = require('base64url');
var jose = require('jsrsasign');
var cors = require('cors');

var app = express();

app.use(bodyParser.urlencoded({ extended: true })); // support form-encoded bodies (for bearer tokens)

app.engine('html', cons.underscore);
app.set('view engine', 'html');
app.set('views', 'files/protectedResource');
app.set('json spaces', 4);

app.use('/', express.static('files/protectedResource'));
app.use(cors());

var resource = {
	"name": "Protected Resource",
	"description": "This data has been protected by OAuth 2.0"
};


var protectedResources = {
		"resource_id": "test_client_1",
		"resource_secret": "test_secret"
};

var authServer = {
	introspectionEndpoint: 'http://localhost:8080/v1/oauth/introspect'
};


var getAccessToken = function(req, res, next) {
	// Extraemos el token del header
	var auth = req.headers['authorization'];
	var inToken = null;
	if (auth && auth.toLowerCase().indexOf('bearer') == 0) {
		inToken = auth.slice('bearer '.length);
	}

	console.log('Incoming token: %s', inToken);
	


	// Validacion de token.
	// En este caso se realiza contra el servidor de autorizacion enviando el token al endpoint "/instrospect" del mismo.
	// Este llamado devuelve un objeto json con informacion del token, por ej: si esta activo, o cuando expira.
	var form_data = qs.stringify({
		token: inToken
	});
	var headers = {
		'Content-Type': 'application/x-www-form-urlencoded',
		'Authorization': 'Basic ' + new Buffer(querystring.escape(protectedResources.resource_id) + ':' + querystring.escape(protectedResources.resource_secret)).toString('base64')
	};

	var tokRes = request('POST', authServer.introspectionEndpoint,
		{
			body: form_data,
			headers: headers
		}
	);

	if (tokRes.statusCode >= 200 && tokRes.statusCode < 300) {
		var body = JSON.parse(tokRes.getBody());

		console.log('Got introspection response', body);
		var active = body.active;
		if (active) {
			req.access_token = body;
		}
	}
	next();
	return;

};

// Si el token no vino en el header o el mismo esta expirado, se devuelve error 401.
var requireAccessToken = function(req, res, next) {
	if (req.access_token) {
		next();
	} else {
		res.status(401).end();
	}
};


var savedWords = [];

app.get('/words', getAccessToken, requireAccessToken, function(req, res) {

	res.json({resource});

});

app.post('/words', getAccessToken, requireAccessToken, function(req, res) {
	if (__.contains(req.access_token.scope, 'write')) {
		if (req.body.word) {
			savedWords.push(req.body.word);
		}
		res.status(201).end();
	} else {
		res.set('WWW-Authenticate', 'Bearer realm=localhost:9002, error="insufficient_scope", scope="write"');
		res.status(403);
	}
});

app.delete('/words', getAccessToken, requireAccessToken, function(req, res) {
	if (__.contains(req.access_token.scope, 'delete')) {
		savedWords.pop();
		res.status(201).end();
	} else {
		res.set('WWW-Authenticate', 'Bearer realm=localhost:9002, error="insufficient_scope", scope="delete"');
		res.status(403);
	}
});

app.get('/produce', getAccessToken, requireAccessToken, function(req, res) {
	var produce = {fruit: [], veggies: [], meats: []};
	if (__.contains(req.access_token.scope, 'fruit')) {
		produce.fruit = ['apple', 'banana', 'kiwi'];
	}
	if (__.contains(req.access_token.scope, 'veggies')) {
		produce.veggies = ['lettuce', 'onion', 'potato'];
	}
	if (__.contains(req.access_token.scope, 'meats')) {
		produce.meats = ['bacon', 'steak', 'chicken breast'];
	}
	console.log('Sending produce: ', produce);
	res.json(produce);
});

var aliceFavorites = {
	'movies': ['The Multidmensional Vector', 'Space Fights', 'Jewelry Boss'],
	'foods': ['bacon', 'pizza', 'bacon pizza'],
	'music': ['techno', 'industrial', 'alternative']
};

var bobFavories = {
	'movies': ['An Unrequited Love', 'Several Shades of Turquoise', 'Think Of The Children'],
	'foods': ['bacon', 'kale', 'gravel'],
	'music': ['baroque', 'ukulele', 'baroque ukulele']
};

app.get('/favorites', getAccessToken, requireAccessToken, function(req, res) {
	if (req.access_token.username == 'test@user') {
		res.json({user: 'User test', favorites: aliceFavorites});
	} else if (req.access_token.user == 'bob') {
		res.json({user: 'Bob', favorites: bobFavorites});
	} else {
		var unknown = {user: 'Unknown', favorites: {movies: [], foods: [], music: []}};
		res.json(unknown);
	}
});

app.options('/resource', cors());

app.post("/resource", cors(), getAccessToken, function(req, res){

	if (req.access_token) {
		res.json(resource);
	} else {
		res.status(401).end();
	}

});

var server = app.listen(9002, 'localhost', function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('OAuth Resource Server is listening at http://%s:%s', host, port);
});
