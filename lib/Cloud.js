
var module = angular.module('ParseAngular.Cloud', ['ParseAngular.Core']);
module.factory('ParseCloud', function(ParseCore){
    /**
    * @namespace Contains functions for calling and declaring
    * <a href="/docs/cloud_code_guide#functions">cloud functions</a>.
    * <p><strong><em>
    *   Some functions are only available from Cloud Code.
    * </em></strong></p>
    */
    var ParseCloud = {};

    _.extend(ParseCloud, /** @lends Parse.Cloud */ {
        /**
        * Makes a call to a cloud function.
        * @param {String} name The function name.
        * @param {Object} data The parameters to send to the cloud function.
        * @param {Object} options A Backbone-style options object
        * options.success, if set, should be a function to handle a successful
        * call to a cloud function.  options.error should be a function that
        * handles an error running the cloud function.  Both functions are
        * optional.  Both functions take a single argument.
        * @return {Parse.Promise} A promise that will be resolved with the result
        * of the function.
        */
        run: function(name, data, options) {
            options = options || {};

            var request = ParseCore._request({
                route: "functions",
                className: name,
                method: 'POST',
                useMasterKey: options.useMasterKey,
                data: ParseCore._encode(data, null, true)
            });

            return request.then(function(resp) {
                return ParseCore._decode(null, resp).result;
            })
            // ._thenRunCallbacks(options);
        }
    });

    return ParseCloud;
});