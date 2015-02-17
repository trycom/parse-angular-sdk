var module = angular.module("ParseAngular.Core", [
    'ParseAngular.Error'
]);

module.factory('ParseCore', function($http, $q, ParseError, $injector){

    var ParseCore = {};
    /**
    * Contains all Parse API classes and functions.
    * @name Parse
    * @namespace
    *
    * Contains all Parse API classes and functions.
    */


    // Load references to other dependencies
    if (typeof(localStorage) !== 'undefined') {
        ParseCore.localStorage = localStorage;  
    }

    // if (typeof(XMLHttpRequest) !== 'undefined') {
    //     ParseCore.XMLHttpRequest = XMLHttpRequest;
    // } else if (typeof(require) !== 'undefined') {
    //     ParseCore.XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
    // }
    // Import Parse's local copy of underscore.
    // if (typeof(exports) !== 'undefined' && exports._) {
    // // We're running in a CommonJS environment
    //     _ = exports._.noConflict();
    //         exports.Parse = Parse;
    // } else {
    //     _ = _.noConflict();
    // }

    // If jQuery or Zepto has been included, grab a reference to it.
    if (typeof($) !== "undefined") {
        ParseCore.$ = $;
    }

    // Helpers
    // -------

    // Shared empty constructor function to aid in prototype-chain creation.
    var EmptyConstructor = function() {};


    // Helper function to correctly set up the prototype chain, for subclasses.
    // Similar to `goog.inherits`, but uses a hash of prototype properties and
    // class properties to be extended.
    var inherits = function(parent, protoProps, staticProps) {
        var child;

        // The constructor function for the new subclass is either defined by you
        // (the "constructor" property in your `extend` definition), or defaulted
        // by us to simply call the parent's constructor.
        if (protoProps && protoProps.hasOwnProperty('constructor')) {
            child = protoProps.constructor;
        } else {
        /** @ignore */
            child = function(){ parent.apply(this, arguments); };
        }

        // Inherit class (static) properties from parent.
        _.extend(child, parent);

        // Set the prototype chain to inherit from `parent`, without calling
        // `parent`'s constructor function.
        EmptyConstructor.prototype = parent.prototype;
        child.prototype = new EmptyConstructor();

        // Add prototype properties (instance properties) to the subclass,
        // if supplied.
        if (protoProps) {
            _.extend(child.prototype, protoProps);
        }

        // Add static properties to the constructor function, if supplied.
        if (staticProps) {
            _.extend(child, staticProps);
        }

        // Correctly set child's `prototype.constructor`.
        child.prototype.constructor = child;

        // Set a convenience property in case the parent's prototype is
        // needed later.
        child.__super__ = parent.prototype;

        return child;
    };

    // Set the server for Parse to talk to.
    ParseCore.serverURL = "https://api.parse.com";

    /**
        * Call this method first to set up your authentication tokens for ParseCore.
        * You can get your keys from the Data Browser on ParseCore.com.
    * @param {String} applicationId Your Parse Application ID.
    * @param {String} javaScriptKey Your Parse JavaScript Key.
    * @param {String} masterKey (optional) Your Parse Master Key. (Node.js only!)
    */
    ParseCore.initialize = function(applicationId, javaScriptKey, masterKey) {
        if (masterKey) {
            throw "ParseCore.initialize() was passed a Master Key, which is only " +
        "allowed from within Node.js.";
        }
        _initialize(applicationId, javaScriptKey);
    };

    /**
        * Call this method first to set up master authentication tokens for ParseCore.
    * This method is for Parse's own private use.
    * @param {String} applicationId Your Parse Application ID.
    * @param {String} javaScriptKey Your Parse JavaScript Key.
    * @param {String} masterKey Your Parse Master Key.
    */
    var _initialize = function(applicationId, javaScriptKey, masterKey) {
        ParseCore.applicationId = applicationId;
        ParseCore.javaScriptKey = javaScriptKey;
        ParseCore.masterKey = masterKey;
        _useMasterKey = false;
    };


    /**
        * Returns prefix for localStorage keys used by this instance of ParseCore.
    * @param {String} path The relative suffix to append to it.
    *     null or undefined is treated as the empty string.
    * @return {String} The full key name.
    */
    ParseCore._getParsePath = _getParsePath = function(path) {
        if (!ParseCore.applicationId) {
            throw "You need to call ParseCore.initialize before using ParseCore.";
        }
        if (!path) {
            path = "";
        }
        if (!_.isString(path)) {
        throw "Tried to get a localStorage path that wasn't a String.";
        }
        if (path[0] === "/") {
            path = path.substring(1);
        }
        return "Parse/" + ParseCore.applicationId + "/" + path;
    };

    /**
    * Returns the unique string for this app on this machine.
    * Gets reset when localStorage is cleared.
    */
    var _installationId = null;
    ParseCore._getInstallationId = function() {
        // See if it's cached in RAM.
        if (_installationId) {
            return _installationId;
        }

        // Try to get it from localStorage.
        var path = _getParsePath("installationId");
        _installationId = ParseCore.localStorage.getItem(path);

        if (!_installationId || _installationId === "") {
            // It wasn't in localStorage, so create a new one.
            var hexOctet = function() {
                return Math.floor((1+Math.random())*0x10000).toString(16).substring(1);
            };
            _installationId = (
                hexOctet() + hexOctet() + "-" +
                hexOctet() + "-" +
                hexOctet() + "-" +
                hexOctet() + "-" +
                hexOctet() + hexOctet() + hexOctet());
                ParseCore.localStorage.setItem(path, _installationId);
        }

        return _installationId;
    };

    ParseCore._parseDate = function(iso8601) {
        var regexp = new RegExp(
        "^([0-9]{1,4})-([0-9]{1,2})-([0-9]{1,2})" + "T" +
        "([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2})" +
        "(.([0-9]+))?" + "Z$");
        var match = regexp.exec(iso8601);
        if (!match) {
        return null;
        }

        var year = match[1] || 0;
        var month = (match[2] || 1) - 1;
        var day = match[3] || 0;
        var hour = match[4] || 0;
        var minute = match[5] || 0;
        var second = match[6] || 0;
        var milli = match[8] || 0;

        return new Date(Date.UTC(year, month, day, hour, minute, second, milli));
    };


    // $http takes care of the compatibility for us.
    // _ajaxIE8 = function(method, url, data) {
    //     var promise = new ParseCore.Promise();
    //     var xdr = new XDomainRequest();
    //     xdr.onload = function() {
    //         var response;
    //         try {
    //             response = JSON.parse(xdr.responseText);
    //         } catch (e) {
    //             promise.reject(e);
    //         }
    //         if (response) {
    //             promise.resolve(response);
    //         }
    //     };
    //     xdr.onerror = xdr.ontimeout = function() {
    //         // Let's fake a real error message.
    //         var fakeResponse = {
    //             responseText: JSON.stringify({
    //             code: ParseError.X_DOMAIN_REQUEST,
    //             error: "IE's XDomainRequest does not supply error info."
    //             })
    //         };

    //         promise.reject(fakeResponse);
    //     };
    //     xdr.onprogress = function() {};
    //     xdr.open(method, url);
    //     xdr.send(data);
    //     return promise;
    // };

    // _useXDomainRequest = function() {
    //     if (typeof(XDomainRequest) !== "undefined") {
    //         // We're in IE 8+.
    //         if ('withCredentials' in new XMLHttpRequest()) {
    //             // We're in IE 10+.
    //             return false;
    //         }
    //         return true;
    //     }
    //     return false;
    // };


    // Updated _ajax function for angular
    var _ajax;
    ParseCore._ajax = _ajax = function(method, url, data, success, error) {
        return $http({
            method: method,
            url: url,
            data: data,
            headers: {
                "Content-Type": "text/plain"
            }
        })
        .then(function(httpResult){
            return httpResult.data;
        },
        function(err){
            return $q.reject(httpResult.data);
        });
    };

    // A self-propagating extend function.
    ParseCore._extend = function(protoProps, classProps) {
        var child = inherits(this, protoProps, classProps);
        child.extend = this.extend;
        return child;
    };

    /**
    * Options:
    *   route: is classes, users, login, etc.
    *   objectId: null if there is no associated objectId.
    *   method: the http method for the REST API.
    *   dataObject: the payload as an object, or null if there is none.
    *   useMasterKey: overrides whether to use the master key if set.
    * @ignore
    */
    ParseCore._request = function(options) {
        var route = options.route;
        var className = options.className;
        var objectId = options.objectId;
        var method = options.method;
        var useMasterKey = options.useMasterKey;
        var sessionToken = options.sessionToken;
        var dataObject = options.data;

        if (!ParseCore.applicationId) {
            throw "You must specify your applicationId using ParseCore.initialize.";
        }

        if (!ParseCore.javaScriptKey && !ParseCore.masterKey) {
            throw "You must specify a key using ParseCore.initialize.";
        }


        if (!sessionToken) {

            var ParseUser = $injector.get('ParseUser');
        // Use the current user session token if none was provided.
            var currentUser = ParseUser.current();
            if (currentUser && currentUser._sessionToken) {
                sessionToken = currentUser._sessionToken;
            }
        }


        if (route !== "batch" &&
            route !== "classes" &&
            route !== "events" &&
            route !== "files" &&
            route !== "functions" &&
            route !== "login" &&
            route !== "push" &&
            route !== "requestPasswordReset" &&
            route !== "rest_verify_analytics" &&
            route !== "users" &&
            route !== "jobs" &&
            route !== "config") {
            throw "Bad route: '" + route + "'.";
        }

        var url = ParseCore.serverURL;
        if (url.charAt(url.length - 1) !== "/") {
            url += "/";
        }
        url += "1/" + route;
        if (className) {
            url += "/" + className;
        }
        if (objectId) {
            url += "/" + objectId;
        }

        dataObject = _.clone(dataObject || {});
        if (method !== "POST") {
            dataObject._method = method;
            method = "POST";
        }

        if (_.isUndefined(useMasterKey)) {
            useMasterKey = _useMasterKey;
        }

        dataObject._ApplicationId = ParseCore.applicationId;

        if (!useMasterKey) {
            dataObject._JavaScriptKey = ParseCore.javaScriptKey;
        } else {
            dataObject._MasterKey = ParseCore.masterKey;
        }

        dataObject._ClientVersion = ParseCore.VERSION;
        dataObject._InstallationId = ParseCore._getInstallationId();
        if (sessionToken) {
            dataObject._SessionToken = sessionToken;
        }
        var data = JSON.stringify(dataObject);

        return _ajax(method, url, data).then(null, function(response) {
                // Transform the error into an instance of ParseError by trying to parse
            // the error string as JSON.
            var error;
            if (response && response.responseText) {
                try {
                    var errorJSON = JSON.parse(response.responseText);
                    error = new ParseError(errorJSON.code, errorJSON.error);
                } catch (e) {
                    // If we fail to parse the error text, that's okay.
                    error = new ParseError(
                        ParseError.INVALID_JSON,
                        "Received an error with invalid JSON from Parse: " +
                        response.responseText
                    );
                }
            } else {
                error = new ParseError(
                    ParseError.CONNECTION_FAILED,
                    "XMLHttpRequest failed: " + JSON.stringify(response)
                );
            }
            // By explicitly returning a rejected Promise, this will work with
            // either jQuery or Promises/A semantics.
            return $q.reject(error);
        });
    };

    // Helper function to get a value from a Backbone object as a property
    // or as a function.
    ParseCore._getValue = function(object, prop) {
        if (!(object && object[prop])) {
            return null;
        }
        return _.isFunction(object[prop]) ? object[prop]() : object[prop];
    };

    /**
    * Converts a value in a Parse Object into the appropriate representation.
        * This is the JS equivalent of Java's ParseCore.maybeReferenceAndEncode(Object)
        * if seenObjects is falsey. Otherwise any ParseObjects not in
    * seenObjects will be fully embedded rather than encoded
    * as a pointer.  This array will be used to prevent going into an infinite
    * loop because we have circular references.  If seenObjects
    * is set, then none of the Parse Objects that are serialized can be dirty.
    */
    ParseCore._encode = _encode = function(value, seenObjects, disallowObjects) {

        var ParseObject = $injector.get('ParseObject'),
            ParseACL = $injector.get('ParseACL'),
            ParseGeoPoint = $injector.get('ParseGeoPoint'),
            ParseRelation = $injector.get('ParseRelation'),
            ParseOp = $injector.get('ParseOp');


        if (value instanceof ParseObject) {
            if (disallowObjects) {
                throw "ParseObjects not allowed here";
            }
            if (!seenObjects || _.include(seenObjects, value) || !value._hasData) {
                return value._toPointer();
            }
            if (!value.dirty()) {
                seenObjects = seenObjects.concat(value);
                return _encode(value._toFullJSON(seenObjects),
                seenObjects,
                disallowObjects);
            }
            throw "Tried to save an object with a pointer to a new, unsaved object.";
        }
        if (value instanceof ParseACL) {
            return value.toJSON();
        }
        if (_.isDate(value)) {
            return { "__type": "Date", "iso": value.toJSON() };
        }
        if (value instanceof ParseGeoPoint) {
            return value.toJSON();
        }
        if (_.isArray(value)) {
            return _.map(value, function(x) {
                return _encode(x, seenObjects, disallowObjects);
            });
        }
        if (_.isRegExp(value)) {
            return value.source;
        }
        if (value instanceof ParseRelation) {
            return value.toJSON();
        }
        if (value instanceof ParseOp) {
            return value.toJSON();
        }
        // if (value instanceof ParseCore.File) {
        //     if (!value.url()) {
        //         throw "Tried to save an object containing an unsaved file.";
        //     }
            
        //     return {
        //         __type: "File",
        //         name: value.name(),
        //         url: value.url()
        //     };
        // }
        if (_.isObject(value)) {
            var output = {};
            ParseCore._objectEach(value, function(v, k) {
                output[k] = _encode(v, seenObjects, disallowObjects);
            });
            return output;
        }

        return value;
    };

    /**
        * The inverse function of _encode.
    * TODO: make decode not mutate value.
    */
    ParseCore._decode = _decode = function(key, value) {

        var ParseObject = $injector.get('ParseObject'),
            ParseACL = $injector.get('ParseACL'),
            ParseGeoPoint = $injector.get('ParseGeoPoint'),
            ParseRelation = $injector.get('ParseRelation'),
            ParseOp = $injector.get('ParseOp');

        if (!_.isObject(value)) {
            return value;
        }
        if (_.isArray(value)) {
            ParseCore._arrayEach(value, function(v, k) {
                value[k] = _decode(k, v);
            });
            return value;
        }
        if (value instanceof ParseObject) {
            return value;
        }
        // if (value instanceof ParseCore.File) {
        //     return value;
        // }
        if (value instanceof ParseOp) {
            return value;
        }
        if (value.__op) {
            return ParseOp._decode(value);
        }
        if (value.__type === "Pointer" && value.className) {
            var pointer = ParseObject._create(value.className);
            pointer._finishFetch({ objectId: value.objectId }, false);
            return pointer;
        }
        if (value.__type === "Object" && value.className) {
            // It's an Object included in a query result.
            var className = value.className;
            delete value.__type;
            delete value.className;
            var object = ParseObject._create(className);
            object._finishFetch(value, true);
            return object;
        }
        if (value.__type === "Date") {
            return ParseCore._parseDate(value.iso);
        }
        if (value.__type === "GeoPoint") {
            return new ParseGeoPoint({
                latitude: value.latitude,
                longitude: value.longitude
            });
        }
        if (key === "ACL") {
            if (value instanceof ParseACL) {
                return value;
            }
            return new ParseACL(value);
        }
        if (value.__type === "Relation") {
            var relation = new ParseRelation(null, key);
            relation.targetClassName = value.className;
            return relation;
        }

        // if (value.__type === "File") {
        //     var file = new ParseCore.File(value.name);
        //     file._url = value.url;
        //     return file;
        // }

        ParseCore._objectEach(value, function(v, k) {
            value[k] = _decode(k, v);
        });
        return value;
    };

    ParseCore._arrayEach = _.each;

    /**
    * Does a deep traversal of every item in object, calling func on every one.
    * @param {Object} object The object or array to traverse deeply.
    * @param {Function} func The function to call for every item. It will
    *     be passed the item as an argument. If it returns a truthy value, that
    *     value will replace the item in its parent container.
    * @returns {} the result of calling func on the top-level object itself.
    */
    ParseCore._traverse = _traverse = function(object, func, seen) {

        var ParseObject = $injector.get('ParseObject'),
            ParseACL = $injector.get('ParseACL'),
            ParseGeoPoint = $injector.get('ParseGeoPoint'),
            ParseRelation = $injector.get('ParseRelation'),
            ParseOp = $injector.get('ParseOp');

        if (object instanceof ParseObject) {
            seen = seen || [];
            if (_.indexOf(seen, object) >= 0) {
                // We've already visited this object in this call.
                return;
            }
            seen.push(object);
            _traverse(object.attributes, func, seen);
            return func(object);
        }
        if (object instanceof ParseRelation) {
            // Nothing needs to be done, but we don't want to recurse into the
            // object's parent infinitely, so we catch this case.
            return func(object);
        }
        if (_.isArray(object)) {
            _.each(object, function(child, index) {
                var newChild = _traverse(child, func, seen);
                if (newChild) {
                    object[index] = newChild;
                }
            });
            return func(object);
        }
        if (_.isObject(object)) {
            _each(object, function(child, key) {
                var newChild = _traverse(child, func, seen);
                if (newChild) {
                    object[key] = newChild;
                }
            });
            return func(object);
        }
        return func(object);
    };

    /**
    * This is like _.each, except:
    * * it doesn't work for so-called array-like objects,
    * * it does work for dictionaries with a "length" attribute.
    */
    ParseCore._objectEach = _each = function(obj, callback) {
        if (_.isObject(obj)) {
            _.each(_.keys(obj), function(key) {
                callback(obj[key], key);
            });
        } else {
            _.each(obj, callback);
        }
    };

    // Helper function to check null or undefined.
    ParseCore._isNullOrUndefined = _isNullOrUndefined = function(x) {
        return _.isNull(x) || _.isUndefined(x);
    };


    ParseCore._continueWhile = _continueWhile = function(predicate, asyncFunction) {
        if (predicate()) {
            return asyncFunction().then(function() {
                return _continueWhile(predicate, asyncFunction);
            });
        }
        var defer = $q.defer();
        defer.resolve();
        return defer.promise;
    };



    return ParseCore;

});