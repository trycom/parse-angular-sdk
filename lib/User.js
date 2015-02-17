var module = angular.module('ParseAngular.User', [
    'ParseAngular.Object',
    'ParseAngular.Core'
]);

module.factory('ParseUser', function(ParseObject, ParseCore){
   
    ParseUser = ParseObject.extend("_User", /** @lends ParseUser.prototype */ {
        // Instance Variables
        _isCurrentUser: false,


        // Instance Methods

        /**
        * Merges another object's attributes into this object.
        */
        _mergeFromObject: function(other) {
            if (other.getSessionToken()) {
                this._sessionToken = other.getSessionToken();      
            }    
            ParseUser.__super__._mergeFromObject.call(this, other);
        },    

        /**
        * Internal method to handle special fields in a _User response.
        */
        _mergeMagicFields: function(attrs) {
            if (attrs.sessionToken) {
                this._sessionToken = attrs.sessionToken;
                delete attrs.sessionToken;
            }
            ParseUser.__super__._mergeMagicFields.call(this, attrs);
        },

        /**
        * Removes null values from authData (which exist temporarily for
        * unlinking)
        */
        _cleanupAuthData: function() {
            if (!this.isCurrent()) {
                return;
            }
            var authData = this.get('authData');
            if (!authData) {
                return;
            }
            ParseCore._objectEach(this.get('authData'), function(value, key) {
                if (!authData[key]) {
                    delete authData[key];
                }
            });
        },

        /**
        * Synchronizes authData for all providers.
        */
        _synchronizeAllAuthData: function() {
            var authData = this.get('authData');
            if (!authData) {
            return;
            }

            var self = this;
            ParseCore._objectEach(this.get('authData'), function(value, key) {
                self._synchronizeAuthData(key);
            });
        },

        /**
        * Synchronizes auth data for a provider (e.g. puts the access token in the
        * right place to be used by the Facebook SDK).
        */
        _synchronizeAuthData: function(provider) {
            if (!this.isCurrent()) {
                return;
            }
            var authType;
            if (_.isString(provider)) {
                authType = provider;
                provider = ParseUser._authProviders[authType];
            } else {
                authType = provider.getAuthType();
            }
            var authData = this.get('authData');
            if (!authData || !provider) {
                return;
            }
            var success = provider.restoreAuthentication(authData[authType]);
            if (!success) {
                this._unlinkFrom(provider);
            }
        },

        _handleSaveResult: function(makeCurrent) {
            // Clean up and synchronize the authData object, removing any unset values
            if (makeCurrent) {
                this._isCurrentUser = true;
            }
            this._cleanupAuthData();
            this._synchronizeAllAuthData();
            // Don't keep the password around.
            delete this._serverData.password;
            this._rebuildEstimatedDataForKey("password");
            this._refreshCache();
            if (makeCurrent || this.isCurrent()) {
                ParseUser._saveCurrentUser(this);
            }
        },

        /**
        * Unlike in the Android/iOS SDKs, logInWith is unnecessary, since you can
        * call linkWith on the user (even if it doesn't exist yet on the server).
        */
        _linkWith: function(provider, options) {
            var authType;
            if (_.isString(provider)) {
                authType = provider;
                provider = ParseUser._authProviders[provider];
            } else {
                authType = provider.getAuthType();
            }
            if (_.has(options, 'authData')) {
                var authData = this.get('authData') || {};
                authData[authType] = options.authData;
                this.set('authData', authData);

                // Overridden so that the user can be made the current user.
                var newOptions = _.clone(options) || {};
                newOptions.success = function(model) {
                    model._handleSaveResult(true);
                    if (options.success) {
                        options.success.apply(this, arguments);
                    }
                };
                return this.save({'authData': authData}, newOptions);
            } else {
                var self = this;
                var defer = $q.defer();
                var promise = defer.promise;
                provider.authenticate({
                    success: function(provider, result) {
                        self._linkWith(provider, {
                            authData: result,
                            success: options.success,
                            error: options.error
                        }).then(function() {
                            promise.resolve(self);
                        });
                    },
                    error: function(provider, error) {
                        if (options.error) {
                            options.error(self, error);
                        }
                        promise.reject(error);
                    }
                });
                return promise;
            }
        },

        /**
        * Unlinks a user from a service.
        */
        _unlinkFrom: function(provider, options) {
            var authType;
            if (_.isString(provider)) {
                authType = provider;
                provider = ParseUser._authProviders[provider];
            } else {
                authType = provider.getAuthType();
            }
            var newOptions = _.clone(options);
            var self = this;
            newOptions.authData = null;
            newOptions.success = function(model) {
                self._synchronizeAuthData(provider);
                if (options.success) {
                    options.success.apply(this, arguments);
                }
            };
            return this._linkWith(provider, newOptions);
        },

        /**
        * Checks whether a user is linked to a service.
        */
        _isLinked: function(provider) {
            var authType;
            if (_.isString(provider)) {
                authType = provider;
            } else {
                authType = provider.getAuthType();
            }
            var authData = this.get('authData') || {};
            return !!authData[authType];
        },

        /**
        * Deauthenticates all providers.
        */
        _logOutWithAll: function() {
            var authData = this.get('authData');
            if (!authData) {
                return;
            }
            var self = this;
            ParseCore._objectEach(this.get('authData'), function(value, key) {
                self._logOutWith(key);
            });
        },

        /**
        * Deauthenticates a single provider (e.g. removing access tokens from the
        * Facebook SDK).
        */
        _logOutWith: function(provider) {
            if (!this.isCurrent()) {
                return;
            }
            if (_.isString(provider)) {
                provider = ParseUser._authProviders[provider];
            }
            if (provider && provider.deauthenticate) {
                provider.deauthenticate();
            }
        },

        /**
        * Signs up a new user. You should call this instead of save for
        * new ParseUsers. This will create a new ParseUser on the server, and
        * also persist the session on disk so that you can access the user using
        * <code>current</code>.
        *
        * <p>A username and password must be set before calling signUp.</p>
        *
        * <p>Calls options.success or options.error on completion.</p>
        *
        * @param {Object} attrs Extra fields to set on the new user, or null.
        * @param {Object} options A Backbone-style options object.
        * @return {Parse.Promise} A promise that is fulfilled when the signup
        *     finishes.
        * @see ParseUser.signUp
        */
        signUp: function(attrs, options) {
            var error;
            options = options || {};

            var username = (attrs && attrs.username) || this.get("username");
            if (!username || (username === "")) {
                error = new ParseError(
                    ParseError.OTHER_CAUSE,
                    "Cannot sign up user with an empty name.");
                return $q.reject(error);
            }

            var password = (attrs && attrs.password) || this.get("password");
            if (!password || (password === "")) {
                error = new ParseError(
                    ParseError.OTHER_CAUSE,
                    "Cannot sign up user with an empty password.");
                if (options && options.error) {
                    options.error(this, error);
                }
                return $q.reject(error);
            }

            return this.save(attrs)
            .then(function(model){
                model._handleSaveResult(true);
                return model;
            })
        },

        /**
        * Logs in a ParseUser. On success, this saves the session to localStorage,
        * so you can retrieve the currently logged in user using
        * <code>current</code>.
        *
        * <p>A username and password must be set before calling logIn.</p>
        *
        * <p>Calls options.success or options.error on completion.</p>
        *
        * @param {Object} options A Backbone-style options object.
        * @see ParseUser.logIn
        * @return {Parse.Promise} A promise that is fulfilled with the user when
        *     the login is complete.
        */
        logIn: function(options) {
            var model = this;
            options = options || {};
            var request = ParseCore._request({
                route: "login",
                method: "GET",
                useMasterKey: options.useMasterKey,
                data: this.toJSON()
            });
            return request.then(function(resp, status, xhr) {
                var serverAttrs = model.parse(resp, status, xhr);
                model._finishFetch(serverAttrs);
                model._handleSaveResult(true);
                return model;
            })
            // ._thenRunCallbacks(options, this);
        },

        /**
        * @see ParseObject#save
        */
        save: function(arg1, arg2, arg3) {
            var i, attrs, current, options, saved;
            if (_.isObject(arg1) || _.isNull(arg1) || _.isUndefined(arg1)) {
                attrs = arg1;
                options = arg2;
            } else {
                attrs = {};
                attrs[arg1] = arg2;
                options = arg3;
            }
            options = options || {};

            return ParseObject.prototype.save.call(this, attrs, newOptions)
            .then(function(model){
                model._handleSaveResult(false);
                return model;
            });
        },

        /**
        * @see ParseObject#fetch
        */
        fetch: function(options) {
            return ParseObject.prototype.fetch.call(this, newOptions)
            .then(function(model){
                model._handleSaveResult(false);
                return model;
            });
        },

        /**
        * Returns true if <code>current</code> would return this user.
        * @see ParseUser#current
        */
        isCurrent: function() {
            return this._isCurrentUser;
        },

        /**
        * Returns get("username").
        * @return {String}
        * @see ParseObject#get
        */
        getUsername: function() {
            return this.get("username");
        },

        /**
        * Calls set("username", username, options) and returns the result.
        * @param {String} username
        * @param {Object} options A Backbone-style options object.
        * @return {Boolean}
        * @see ParseObject.set
        */
        setUsername: function(username, options) {
            return this.set("username", username, options);
        },

        /**
        * Calls set("password", password, options) and returns the result.
        * @param {String} password
        * @param {Object} options A Backbone-style options object.
        * @return {Boolean}
        * @see ParseObject.set
        */
        setPassword: function(password, options) {
            return this.set("password", password, options);
        },

        /**
        * Returns get("email").
        * @return {String}
        * @see ParseObject#get
        */
        getEmail: function() {
            return this.get("email");
        },

        /**
        * Calls set("email", email, options) and returns the result.
        * @param {String} email
        * @param {Object} options A Backbone-style options object.
        * @return {Boolean}
        * @see ParseObject.set
        */
        setEmail: function(email, options) {
            return this.set("email", email, options);
        },

        /**
        * Checks whether this user is the current user and has been authenticated.
        * @return (Boolean) whether this user is the current user and is logged in.
        */
        authenticated: function() {
            return !!this._sessionToken &&
            (ParseUser.current() && ParseUser.current().id === this.id);
        },

        /**
        * Returns the session token for this user, if the user has been logged in,
        * or if it is the result of a query with the master key. Otherwise, returns
        * undefined.
        * @return {String} the session token, or undefined
        */
        getSessionToken: function() {
            return this._sessionToken;
        }

        }, /** @lends ParseUser */ {
        // Class Variables

        // The currently logged-in user.
        _currentUser: null,

        // Whether currentUser is known to match the serialized version on disk.
        // This is useful for saving a localstorage check if you try to load
        // _currentUser frequently while there is none stored.
        _currentUserMatchesDisk: false,

        // The localStorage key suffix that the current user is stored under.
        _CURRENT_USER_KEY: "currentUser",

        // The mapping of auth provider names to actual providers
        _authProviders: {},

        // Whether to rewrite className User to _User
        _performUserRewrite: true,


        // Class Methods

        /**
        * Signs up a new user with a username (or email) and password.
        * This will create a new ParseUser on the server, and also persist the
        * session in localStorage so that you can access the user using
        * {@link #current}.
        *
        * <p>Calls options.success or options.error on completion.</p>
        *
        * @param {String} username The username (or email) to sign up with.
        * @param {String} password The password to sign up with.
        * @param {Object} attrs Extra fields to set on the new user.
        * @param {Object} options A Backbone-style options object.
        * @return {Parse.Promise} A promise that is fulfilled with the user when
        *     the signup completes.
        * @see ParseUser#signUp
        */
        signUp: function(username, password, attrs, options) {
            attrs = attrs || {};
            attrs.username = username;
            attrs.password = password;
            var user = ParseObject._create("_User");
            return user.signUp(attrs, options);
        },

        /**
        * Logs in a user with a username (or email) and password. On success, this
        * saves the session to disk, so you can retrieve the currently logged in
        * user using <code>current</code>.
        *
        * <p>Calls options.success or options.error on completion.</p>
        *
        * @param {String} username The username (or email) to log in with.
        * @param {String} password The password to log in with.
        * @param {Object} options A Backbone-style options object.
        * @return {Parse.Promise} A promise that is fulfilled with the user when
        *     the login completes.
        * @see ParseUser#logIn
        */
        logIn: function(username, password, options) {
            var user = ParseObject._create("_User");
            user._finishFetch({ username: username, password: password });
            return user.logIn(options);
        },

        /**
        * Logs in a user with a session token. On success, this saves the session
        * to disk, so you can retrieve the currently logged in user using
        * <code>current</code>.
        *
        * <p>Calls options.success or options.error on completion.</p>
        *
        * @param {String} sessionToken The sessionToken to log in with.
        * @param {Object} options A Backbone-style options object.
        * @return {Parse.Promise} A promise that is fulfilled with the user when
        *     the login completes.
        */
        become: function(sessionToken, options) {
            options = options || {};

            var user = ParseObject._create("_User");
            return ParseCore._request({
                route: "users",
                className: "me",
                method: "GET",
                useMasterKey: options.useMasterKey,
                sessionToken: sessionToken
            }).then(function(resp, status, xhr) {
                var serverAttrs = user.parse(resp, status, xhr);
                user._finishFetch(serverAttrs);
                user._handleSaveResult(true);
                return user;
            })
            // ._thenRunCallbacks(options, user);
        },

        /**
        * Logs out the currently logged in user session. This will remove the
        * session from disk, log out of linked services, and future calls to
        * <code>current</code> will return <code>null</code>.
        */
        logOut: function() {
            if (ParseUser._currentUser !== null) {
                ParseUser._currentUser._logOutWithAll();
                ParseUser._currentUser._isCurrentUser = false;
            }
            ParseUser._currentUserMatchesDisk = true;
            ParseUser._currentUser = null;
            ParseCore.localStorage.removeItem(
            ParseCore._getParsePath(ParseUser._CURRENT_USER_KEY));
        },

        /**
        * Requests a password reset email to be sent to the specified email address
        * associated with the user account. This email allows the user to securely
        * reset their password on the Parse site.
        *
        * <p>Calls options.success or options.error on completion.</p>
        *
        * @param {String} email The email address associated with the user that
        *     forgot their password.
        * @param {Object} options A Backbone-style options object.
        */
        requestPasswordReset: function(email, options) {
            options = options || {};
            var request = ParseCore._request({
                route: "requestPasswordReset",
                method: "POST",
                useMasterKey: options.useMasterKey,
                data: { email: email }
            });
            return request
            // ._thenRunCallbacks(options);
        },

        /**
        * Retrieves the currently logged in ParseUser with a valid session,
        * either from memory or localStorage, if necessary.
        * @return {ParseObject} The currently logged in ParseUser.
        */
        current: function() {
            if (ParseUser._currentUser) {
                return ParseUser._currentUser;
            }

            if (ParseUser._currentUserMatchesDisk) {
                return ParseUser._currentUser;
            }

            // Load the user from local storage.
            ParseUser._currentUserMatchesDisk = true;

            var userData = ParseCore.localStorage.getItem(ParseCore._getParsePath(
                ParseUser._CURRENT_USER_KEY)
            );
            if (!userData) {
                return null;
            }
            ParseUser._currentUser = ParseObject._create("_User");
            ParseUser._currentUser._isCurrentUser = true;

            var json = JSON.parse(userData);
            ParseUser._currentUser.id = json._id;
            delete json._id;
            ParseUser._currentUser._sessionToken = json._sessionToken;
            delete json._sessionToken;
            ParseUser._currentUser._finishFetch(json);

            ParseUser._currentUser._synchronizeAllAuthData();
            ParseUser._currentUser._refreshCache();
            ParseUser._currentUser._opSetQueue = [{}];
            return ParseUser._currentUser;
        },

        /**
        * Allow someone to define a custom User class without className
        * being rewritten to _User. The default behavior is to rewrite
        * User to _User for legacy reasons. This allows developers to
        * override that behavior.
        *
        * @param {Boolean} isAllowed Whether or not to allow custom User class
        */
        allowCustomUserClass: function(isAllowed) {
            this._performUserRewrite = !isAllowed;
        },

        /**
        * Persists a user as currentUser to localStorage, and into the singleton.
        */
        _saveCurrentUser: function(user) {
            if (ParseUser._currentUser !== user) {
                ParseUser.logOut();
            }
            user._isCurrentUser = true;
            ParseUser._currentUser = user;
            ParseUser._currentUserMatchesDisk = true;

            var json = user.toJSON();
            json._id = user.id;
            json._sessionToken = user._sessionToken;
            ParseCore.localStorage.setItem(
            ParseCore._getParsePath(ParseUser._CURRENT_USER_KEY),
            JSON.stringify(json));
        },

        _registerAuthenticationProvider: function(provider) {
            ParseUser._authProviders[provider.getAuthType()] = provider;
            // Synchronize the current user with the auth provider.
            if (ParseUser.current()) {
                ParseUser.current()._synchronizeAuthData(provider.getAuthType());
            }
        },

        _logInWith: function(provider, options) {
            var user = ParseObject._create("_User");
            return user._linkWith(provider, options);
        }

        });

    return ParseUser;

});