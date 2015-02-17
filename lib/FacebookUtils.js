var module = angular.module("ParseAngular.FacebookUtils", [
    'ParseAngular.User',
    'ParseAngular.Core'
]);

module.factory('ParseFacebookUtils', function(ParseUser, ParseCore){

    var PUBLIC_KEY = "*", ParseFacebookUtils;

    var initialized = false;
    var requestedPermissions;
    var initOptions;
    var provider = {
        authenticate: function(options) {
            var self = this;
            FB.login(function(response) {
                if (response.authResponse) {
                    if (options.success) {
                        options.success(self, {
                            id: response.authResponse.userID,
                            access_token: response.authResponse.accessToken,
                            expiration_date: new Date(response.authResponse.expiresIn * 1000 +
                            (new Date()).getTime()).toJSON()
                        });
                    }
                } else {
                    if (options.error) {
                        options.error(self, response);
                    }
                }
            }, {
                scope: requestedPermissions
            });
        },
        restoreAuthentication: function(authData) {
            if (authData) {
                var authResponse = {
                    userID: authData.id,
                    accessToken: authData.access_token,
                    expiresIn: (ParseCore._parseDate(authData.expiration_date).getTime() -
                    (new Date()).getTime()) / 1000
                };
                var newOptions = _.clone(initOptions);
                newOptions.authResponse = authResponse;

                // Suppress checks for login status from the browser.
                newOptions.status = false;

                // If the user doesn't match the one known by the FB SDK, log out.
                // Most of the time, the users will match -- it's only in cases where
                // the FB SDK knows of a different user than the one being restored
                // from a Parse User that logged in with username/password.
                var existingResponse = FB.getAuthResponse();
                if (existingResponse &&
                existingResponse.userID !== authResponse.userID) {
                    FB.logout();
                }

                FB.init(newOptions);
            }
            return true;
        },
        getAuthType: function() {
            return "facebook";
        },
        deauthenticate: function() {
            this.restoreAuthentication(null);
        }
    };

    /**
    * Provides a set of utilities for using Parse with Facebook.
    * @namespace
    * Provides a set of utilities for using Parse with Facebook.
    */
    ParseFacebookUtils = {
        /**
        * Initializes Parse Facebook integration.  Call this function after you
        * have loaded the Facebook Javascript SDK with the same parameters
        * as you would pass to<code>
        * <a href=
        * "https://developers.facebook.com/docs/reference/javascript/FB.init/">
        * FB.init()</a></code>.  ParseFacebookUtils will invoke FB.init() for you
        * with these arguments.
        *
        * @param {Object} options Facebook options argument as described here:
        *   <a href=
        *   "https://developers.facebook.com/docs/reference/javascript/FB.init/">
        *   FB.init()</a>. The status flag will be coerced to 'false' because it
        *   interferes with Parse Facebook integration. Call FB.getLoginStatus()
        *   explicitly if this behavior is required by your application.
        */
        init: function(options) {
            if (typeof(FB) === 'undefined') {
                throw "The Facebook JavaScript SDK must be loaded before calling init.";
            } 
            initOptions = _.clone(options) || {};
            if (initOptions.status && typeof(console) !== "undefined") {
                var warn = console.warn || console.log || function() {};
                warn.call(console, "The 'status' flag passed into" +
                " FB.init, when set to true, can interfere with Parse Facebook" +
                " integration, so it has been suppressed. Please call" +
                " FB.getLoginStatus() explicitly if you require this behavior.");
            }
            initOptions.status = false;
            FB.init(initOptions);
            ParseUser._registerAuthenticationProvider(provider);
            initialized = true;
        },

        /**
        * Gets whether the user has their account linked to Facebook.
        * 
        * @param {Parse.User} user User to check for a facebook link.
        *     The user must be logged in on this device.
        * @return {Boolean} <code>true</code> if the user has their account
        *     linked to Facebook.
        */
        isLinked: function(user) {
            return user._isLinked("facebook");
        },

        /**
        * Logs in a user using Facebook. This method delegates to the Facebook
        * SDK to authenticate the user, and then automatically logs in (or
        * creates, in the case where it is a new user) a Parse.User.
        * 
        * @param {String, Object} permissions The permissions required for Facebook
        *    log in.  This is a comma-separated string of permissions.
        *    Alternatively, supply a Facebook authData object as described in our
        *    REST API docs if you want to handle getting facebook auth tokens
        *    yourself.
        * @param {Object} options Standard options object with success and error
        *    callbacks.
        */
        logIn: function(permissions, options) {
            if (!permissions || _.isString(permissions)) {
                if (!initialized) {
                    throw "You must initialize FacebookUtils before calling logIn.";
                }
                requestedPermissions = permissions;
                return ParseUser._logInWith("facebook", options);
            } else {
                var newOptions = _.clone(options) || {};
                newOptions.authData = permissions;
                return ParseUser._logInWith("facebook", newOptions);
            }
        },

        /**
        * Links Facebook to an existing PFUser. This method delegates to the
        * Facebook SDK to authenticate the user, and then automatically links
        * the account to the Parse.User.
        *
        * @param {Parse.User} user User to link to Facebook. This must be the
        *     current user.
        * @param {String, Object} permissions The permissions required for Facebook
        *    log in.  This is a comma-separated string of permissions. 
        *    Alternatively, supply a Facebook authData object as described in our
        *    REST API docs if you want to handle getting facebook auth tokens
        *    yourself.
        * @param {Object} options Standard options object with success and error
        *    callbacks.
        */
        link: function(user, permissions, options) {
            if (!permissions || _.isString(permissions)) {
                if (!initialized) {
                    throw "You must initialize FacebookUtils before calling link.";
                }
                requestedPermissions = permissions;
                return user._linkWith("facebook", options);
            } else {
                var newOptions = _.clone(options) || {};
                newOptions.authData = permissions;
                return user._linkWith("facebook", newOptions);
            }
        },

        /**
        * Unlinks the Parse.User from a Facebook account. 
        * 
        * @param {Parse.User} user User to unlink from Facebook. This must be the
        *     current user.
        * @param {Object} options Standard options object with success and error
        *    callbacks.
        */
        unlink: function(user, options) {
            if (!initialized) {
                throw "You must initialize FacebookUtils before calling unlink.";
            }
            return user._unlinkFrom("facebook", options);
        }
    };

    return ParseFacebookUtils;

});