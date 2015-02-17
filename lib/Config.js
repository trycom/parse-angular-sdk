var module = angular.module("ParseAngular.Config", [
    'ParseAngular.Core',
    'ParseAngular.Error'
]);

module.factory('ParseConfig', function(ParseCore, ParseError, $q){
    /**
    * @class ParseConfig is a local representation of configuration data that
    * can be set from the Parse dashboard.
    */
    ParseConfig = function() {
        this.attributes = {};
        this._escapedAttributes = {};
    };

    /**
    * Retrieves the most recently-fetched configuration object, either from
    * memory or from local storage if necessary.
    *
    * @return {ParseConfig} The most recently-fetched ParseConfig if it
    *     exists, else an empty ParseConfig.
    */
    ParseConfig.current = function() {
        if (ParseConfig._currentConfig) {
            return ParseConfig._currentConfig;
        }

        var configData = ParseCore.localStorage.getItem(
            ParseCore._getParsePath(ParseConfig._CURRENT_CONFIG_KEY)
        );

        var config = new ParseConfig();
        if (configData) {  
            config._finishFetch(JSON.parse(configData));
            ParseConfig._currentConfig = config;
        }
        return config;
    };

    /**
    * Gets a new configuration object from the server.
    * 
    * @return {ParseCore.Promise} A promise that is resolved with a newly-created
    *     configuration object when the get completes.
    */
    ParseConfig.get = function() {

        var request = ParseCore._request({
            route: "config",    
            method: "GET",
        });

        return request.then(function(response) {
            if (!response || !response.params) {
                var errorObject = new ParseError(
                    ParseCore.Error.INVALID_JSON,
                    "Config JSON response invalid."
                );
                return $q.reject(errorObject);
            }

            var config = new ParseConfig();
            config._finishFetch(response);
            ParseConfig._currentConfig = config;
            return config;
        })
        // ._thenRunCallbacks(options);
    };

    ParseConfig.prototype = {

        /**
        * Gets the HTML-escaped value of an attribute.
        */
        escape: function(attr) {
            var html = this._escapedAttributes[attr];
            if (html) {
                return html;
            }
            var val = this.attributes[attr];
            var escaped;
            if (ParseCore._isNullOrUndefined(val)) {
                escaped = '';
            } else {
                escaped = _.escape(val.toString());
            }
            this._escapedAttributes[attr] = escaped;
            return escaped;
        },

        /**
        * Gets the value of an attribute.
        * @param {String} attr The name of an attribute.
        */
        get: function(attr) {
            return this.attributes[attr];
        },

        _finishFetch: function(serverData) {
            this.attributes = ParseCore._decode(null, _.clone(serverData.params));
            ParseCore.localStorage.setItem(
                ParseCore._getParsePath(ParseConfig._CURRENT_CONFIG_KEY),
                JSON.stringify(serverData)
            );
        }
    };

    ParseConfig._currentConfig = null;

    ParseConfig._CURRENT_CONFIG_KEY = "currentConfig";

    return ParseConfig;

});