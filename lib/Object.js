var module = angular.module("ParseAngular.Object", [
    'ParseAngular.Core',
    'ParseAngular.Error',
    'ParseAngular.Events',
    'ParseAngular.Op'
]);

module.factory('ParseObject', function($q, ParseCore, ParseError, ParseEvents, ParseOp, $injector){


    var ParseObject;

    /**
    * Creates a new model with defined attributes. A client id (cid) is
    * automatically generated and assigned for you.
    *
    * <p>You won't normally call this method directly.  It is recommended that
    * you use a subclass of <code>ParseObject</code> instead, created by calling
    * <code>extend</code>.</p>
    *
    * <p>However, if you don't want to use a subclass, or aren't sure which
    * subclass is appropriate, you can use this form:<pre>
    *     var object = new ParseObject("ClassName");
    * </pre>
    * That is basically equivalent to:<pre>
    *     var MyClass = ParseObject.extend("ClassName");
    *     var object = new MyClass();
    * </pre></p>
    *
    * @param {Object} attributes The initial set of data to store in the object.
    * @param {Object} options A set of Backbone-like options for creating the
    *     object.  The only option currently supported is "collection".
    * @see ParseObject.extend
    *
    * @class
    *
    * <p>The fundamental unit of Parse data, which implements the Backbone Model
    * interface.</p>
    */
    ParseObject = function(attributes, options) {
        // Allow new ParseObject("ClassName") as a shortcut to _create.
        if (_.isString(attributes)) {
            return ParseObject._create.apply(this, arguments);
        }

        attributes = attributes || {};
        if (options && options.parse) {
            attributes = this.parse(attributes);
        }
        var defaults = ParseCore._getValue(this, 'defaults');
        if (defaults) {
            attributes = _.extend({}, defaults, attributes);
        }
        if (options && options.collection) {
            this.collection = options.collection;
        }

        this._serverData = {};  // The last known data for this object from cloud.
        this._opSetQueue = [{}];  // List of sets of changes to the data.
        this.attributes = {};  // The best estimate of this's current data.

        this._hashedJSON = {};  // Hash of values of containers at last save.
        this._escapedAttributes = {};
        this.cid = _.uniqueId('c');
        this.changed = {};
        this._silent = {};
        this._pending = {};
        if (!this.set(attributes, {silent: true})) {
            throw new Error("Can't create an invalid ParseObject");
        }
        this.changed = {};
        this._silent = {};
        this._pending = {};
        this._hasData = true;
        this._previousAttributes = _.clone(this.attributes);
        this.initialize.apply(this, arguments);
    };

    /**
    * The ID of this object, unique within its class.
    * @name id
    * @type String
    * @field
    * @memberOf ParseObject.prototype
    */

    /**
    * The first time this object was saved on the server.
    * @name createdAt
    * @type Date
    * @field
    * @memberOf ParseObject.prototype
    */

    /**
    * The last time this object was updated on the server.
    * @name updatedAt
    * @type Date
    * @field
    * @memberOf ParseObject.prototype
    */

    /**
    * Saves the given list of ParseObject.
    * If any error is encountered, stops and calls the error handler.
    *
    * <pre>
    *   ParseObject.saveAll([object1, object2, ...], {
    *     success: function(list) {
    *       // All the objects were saved.
    *     },
    *     error: function(error) {
    *       // An error occurred while saving one of the objects.
    *     },
    *   });
    * </pre>
    *
    * @param {Array} list A list of <code>ParseObject</code>.
    * @param {Object} options A Backbone-style callback object.
    * Valid options are:<ul>
    *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
    *     be used for this request.
    * </ul>
    */
    ParseObject.saveAll = function(list) {
        return ParseObject._deepSaveAsync(list, {
            useMasterKey: options.useMasterKey
        })
        // ._thenRunCallbacks(options);
    };

    /**
    * Destroy the given list of models on the server if it was already persisted.
    * Optimistically removes each model from its collection, if it has one.
    * If `wait: true` is passed, waits for the server to respond before removal.
    *
    * <p>Unlike saveAll, if an error occurs while deleting an individual model,
    * this method will continue trying to delete the rest of the models if
    * possible, except in the case of a fatal error like a connection error.
    *
    * <p>In particular, the ParseError object returned in the case of error may
    * be one of two types:
    *
    * <ul>
    *   <li>A ParseError.AGGREGATE_ERROR. This object's "errors" property is an
    *       array of other ParseError objects. Each error object in this array
    *       has an "object" property that references the object that could not be
    *       deleted (for instance, because that object could not be found).</li>
    *   <li>A non-aggregate ParseError. This indicates a serious error that 
    *       caused the delete operation to be aborted partway through (for 
    *       instance, a connection failure in the middle of the delete).</li>
    * </ul>
    *
    * <pre>
    *   ParseObject.destroyAll([object1, object2, ...], {
    *     success: function() {
    *       // All the objects were deleted.
    *     },
    *     error: function(error) {
    *       // An error occurred while deleting one or more of the objects.
    *       // If this is an aggregate error, then we can inspect each error
    *       // object individually to determine the reason why a particular
    *       // object was not deleted.
    *       if (error.code == ParseError.AGGREGATE_ERROR) {
    *         for (var i = 0; i < error.errors.length; i++) {
    *           console.log("Couldn't delete " + error.errors[i].object.id + 
    *             "due to " + error.errors[i].message);
    *         }
    *       } else {
    *         console.log("Delete aborted because of " + error.message);
    *       }
    *     },
    *   });
    * </pre>
    *
    * @param {Array} list A list of <code>ParseObject</code>.
    * @param {Object} options A Backbone-style callback object.
    * Valid options are:<ul>
    *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
    *     be used for this request.
    * </ul>
    * @return {ParseCore.Promise} A promise that is fulfilled when the destroyAll
    *     completes.
    */
    ParseObject.destroyAll = function(list, options) {
        options = options || {};

        var triggerDestroy = function(object) {
            object.trigger('destroy', object, object.collection, options);
        };

        var errors = [];
        var destroyBatch = function(batch) {
            var defer = $q.defer(), promise = defer.promise;
            defer.resolve();

            if (batch.length > 0) {
                promise = promise.then(function() {
                    return ParseCore._request({
                        route: "batch",
                        method: "POST",
                        useMasterKey: options.useMasterKey,
                        data: {
                            requests: _.map(batch, function(object) {
                                return {
                                    method: "DELETE",
                                    path: "/1/classes/" + object.className + "/" + object.id
                                };
                            })
                        }
                    });
                }).then(function(responses, status, headers, config) {
                    ParseCore._arrayEach(batch, function(object, i) {
                        if (responses[i].success && options.wait) {
                            triggerDestroy(object);
                        } else if (responses[i].error) {
                            var error = new ParseError(responses[i].error.code, responses[i].error.error);

                            error.object = object;
                            errors.push(error);
                        }
                    });
                });
            }

            return promise;
        };

        var defer = $q.defer();
        defer.resolve();
        var promise = defer.promise;
        var batch = [];

        ParseCore._arrayEach(list, function(object, i) {
            if (!object.id || !options.wait) {
                triggerDestroy(object);
            }

            if (object.id) {
                batch.push(object);
            }

            if (batch.length === 20 || i+1 === list.length) {
                var thisBatch = batch;
                batch = [];

                promise = promise.then(function() {
                    return destroyBatch(thisBatch);
                });
            }
        });

        return promise.then(function() {
            if (errors.length === 0) {
                return true;
            } else {
                var error = new ParseError(ParseError.AGGREGATE_ERROR,
                "Error deleting an object in destroyAll");
                error.errors = errors;

                return $q.reject(error);
            }
        })
        // ._thenRunCallbacks(options);
    };

    /**
    * Fetches the given list of ParseObject.
    * If any error is encountered, stops and calls the error handler.
    *
    * <pre>
    *   ParseObject.fetchAll([object1, object2, ...], {
    *     success: function(list) {
    *       // All the objects were fetched.
    *     },
    *     error: function(error) {
    *       // An error occurred while fetching one of the objects.
    *     },
    *   });
    * </pre>
    *
    * @param {Array} list A list of <code>ParseObject</code>.
    * @param {Object} options A Backbone-style callback object.
    * Valid options are:<ul>
    *   <li>success: A Backbone-style success callback.
    *   <li>error: An Backbone-style error callback.   
    * </ul>
    */
    ParseObject.fetchAll = function(list, options) {
        return ParseObject._fetchAll(
            list, 
            true
        )
        // ._thenRunCallbacks(options);    
    };  

    /**
    * Fetches the given list of ParseObject if needed.
    * If any error is encountered, stops and calls the error handler.
    *
    * <pre>
    *   ParseObject.fetchAllIfNeeded([object1, ...], {
    *     success: function(list) {
    *       // Objects were fetched and updated.
    *     },
    *     error: function(error) {
    *       // An error occurred while fetching one of the objects.
    *     },
    *   });
    * </pre>
    *
    * @param {Array} list A list of <code>ParseObject</code>.
    * @param {Object} options A Backbone-style callback object.
    * Valid options are:<ul>
    *   <li>success: A Backbone-style success callback.
    *   <li>error: An Backbone-style error callback.   
    * </ul>
    */
    ParseObject.fetchAllIfNeeded = function(list, options) {    
        return ParseObject._fetchAll(
            list, 
            false
        )
        // ._thenRunCallbacks(options);
    };    

    // Attach all inheritable methods to the ParseObject prototype.
    _.extend(ParseObject.prototype, ParseEvents,
    /** @lends ParseObject.prototype */ {
        _existed: false,

        /**
        * Initialize is an empty function by default. Override it with your own
        * initialization logic.
        */
        initialize: function(){},

        /**
        * Returns a JSON version of the object suitable for saving to ParseCore.
        * @return {Object}
        */
        toJSON: function() {
            var json = this._toFullJSON();
            ParseCore._arrayEach(["__type", "className"],
                function(key) { delete json[key]; }
            );
            return json;
        },

        _toFullJSON: function(seenObjects) {
            var json = _.clone(this.attributes);
            ParseCore._objectEach(json, function(val, key) {
                json[key] = ParseCore._encode(val, seenObjects);
            });
            ParseCore._objectEach(this._operations, function(val, key) {
                json[key] = val;
            });

            if (_.has(this, "id")) {
                json.objectId = this.id;
            }
            if (_.has(this, "createdAt")) {
                if (_.isDate(this.createdAt)) {
                    json.createdAt = this.createdAt.toJSON();
                } else {
                    json.createdAt = this.createdAt;
                }
            }

            if (_.has(this, "updatedAt")) {
                if (_.isDate(this.updatedAt)) {
                    json.updatedAt = this.updatedAt.toJSON();
                } else {
                    json.updatedAt = this.updatedAt;
                }
            }
            json.__type = "Object";
            json.className = this.className;
            return json;
        },

        /**
        * Updates _hashedJSON to reflect the current state of this object.
        * Adds any changed hash values to the set of pending changes.
        */
        _refreshCache: function() {
            var self = this;
            if (self._refreshingCache) {
                return;
            }
            self._refreshingCache = true;
            ParseCore._objectEach(this.attributes, function(value, key) {
                if (value instanceof ParseObject) {
                    value._refreshCache();
                } else if (_.isObject(value)) {
                    if (self._resetCacheForKey(key)) {
                        self.set(key, new ParseOp.Set(value), { silent: true });
                    }
                }
            });
            delete self._refreshingCache;
        },

        /**
        * Returns true if this object has been modified since its last
        * save/refresh.  If an attribute is specified, it returns true only if that
        * particular attribute has been modified since the last save/refresh.
        * @param {String} attr An attribute name (optional).
        * @return {Boolean}
        */
        dirty: function(attr) {
        this._refreshCache();

            var currentChanges = _.last(this._opSetQueue);

            if (attr) {
                return (currentChanges[attr] ? true : false);
            }
            if (!this.id) {
                return true;
            }
            if (_.keys(currentChanges).length > 0) {
                return true;
            }
            return false;
        },

        /**
        * Returns an array of keys that have been modified since last save/refresh
        * @return {Array of string}
        */
        dirtyKeys: function() {
            return _.keys(_.last(this._opSetQueue));
        },

        /**
        * Gets a Pointer referencing this Object.
        */
        _toPointer: function() {
            if (!this.id) {
                throw new Error("Can't serialize an unsaved ParseObject");
            }
            return { 
                __type: "Pointer",
                className: this.className,
                objectId: this.id 
            };
        },

        /**
        * Gets the value of an attribute.
        * @param {String} attr The string name of an attribute.
        */
        get: function(attr) {
            return this.attributes[attr];
        },

        /**
        * Gets a relation on the given class for the attribute.
        * @param String attr The attribute to get the relation for.
        */
        relation: function(attr) {
            var value = this.get(attr);
            if (value) {
                if (!(value instanceof $injector.get('ParseRelation'))) {
                    throw "Called relation() on non-relation field " + attr;
                }
                value._ensureParentAndKey(this, attr);
                return value;
            } else {
                return new $injector.get('ParseRelation')(this, attr);
            }
        },

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
        * Returns <code>true</code> if the attribute contains a value that is not
        * null or undefined.
        * @param {String} attr The string name of the attribute.
        * @return {Boolean}
        */
        has: function(attr) {
            return !ParseCore._isNullOrUndefined(this.attributes[attr]);
        },

        /**
        * Pulls "special" fields like objectId, createdAt, etc. out of attrs
        * and puts them on "this" directly.  Removes them from attrs.
        * @param attrs - A dictionary with the data for this ParseObject.
        */
        _mergeMagicFields: function(attrs) {
            // Check for changes of magic fields.
            var model = this;
            var specialFields = ["id", "objectId", "createdAt", "updatedAt"];
            ParseCore._arrayEach(specialFields, function(attr) {
                if (attrs[attr]) {
                    if (attr === "objectId") {
                        model.id = attrs[attr];
                    } else if ((attr === "createdAt" || attr === "updatedAt") &&
                        !_.isDate(attrs[attr])) {
                        model[attr] = ParseCore._parseDate(attrs[attr]);
                    } else {
                        model[attr] = attrs[attr];
                    }
                    delete attrs[attr];
                }
            });
        },

        /**
        * Copies the given serverData to "this", refreshes attributes, and
        * clears pending changes;
        */
        _copyServerData: function(serverData) {
            // Copy server data
            var tempServerData = {};
            ParseCore._objectEach(serverData, function(value, key) {
                tempServerData[key] = ParseCore._decode(key, value);
            });
            this._serverData = tempServerData;

            // Refresh the attributes.
            this._rebuildAllEstimatedData();


            // Clear out any changes the user might have made previously.
            this._refreshCache();
            this._opSetQueue = [{}];

            // Refresh the attributes again.
            this._rebuildAllEstimatedData();       
        },

        /**
        * Merges another object's attributes into this object.
        */
        _mergeFromObject: function(other) {
            if (!other) {
                return;
            }

            // This does the inverse of _mergeMagicFields.
            this.id = other.id;
            this.createdAt = other.createdAt;
            this.updatedAt = other.updatedAt;

            this._copyServerData(other._serverData);

            this._hasData = true;
        },

        /**
        * Returns the json to be sent to the server.
        */
        _startSave: function() {
            this._opSetQueue.push({});
        },

        /**
        * Called when a save fails because of an error. Any changes that were part
        * of the save need to be merged with changes made after the save. This
        * might throw an exception is you do conflicting operations. For example,
        * if you do:
        *   object.set("foo", "bar");
        *   object.set("invalid field name", "baz");
        *   object.save();
        *   object.increment("foo");
        * then this will throw when the save fails and the client tries to merge
        * "bar" with the +1.
        */
        _cancelSave: function() {
            var self = this;
            var failedChanges = _.first(this._opSetQueue);
            this._opSetQueue = _.rest(this._opSetQueue);
            var nextChanges = _.first(this._opSetQueue);
            ParseCore._objectEach(failedChanges, function(op, key) {
                var op1 = failedChanges[key];
                var op2 = nextChanges[key];
                if (op1 && op2) {
                    nextChanges[key] = op2._mergeWithPrevious(op1);
                } else if (op1) {
                    nextChanges[key] = op1;
                }
            });
            this._saving = this._saving - 1;
        },

        /**
        * Called when a save completes successfully. This merges the changes that
        * were saved into the known server data, and overrides it with any data
        * sent directly from the server.
        */
        _finishSave: function(serverData) {
            // Grab a copy of any object referenced by this object. These instances
            // may have already been fetched, and we don't want to lose their data.
            // Note that doing it like this means we will unify separate copies of the
            // same object, but that's a risk we have to take.
            var fetchedObjects = {};
            ParseCore._traverse(this.attributes, function(object) {
                if (object instanceof ParseObject && object.id && object._hasData) {
                    fetchedObjects[object.id] = object;
                }
            });

            var savedChanges = _.first(this._opSetQueue);
            this._opSetQueue = _.rest(this._opSetQueue);
            this._applyOpSet(savedChanges, this._serverData);
            this._mergeMagicFields(serverData);
            var self = this;
            ParseCore._objectEach(serverData, function(value, key) {
                self._serverData[key] = ParseCore._decode(key, value);

                // Look for any objects that might have become unfetched and fix them
                // by replacing their values with the previously observed values.
                var fetched = ParseCore._traverse(self._serverData[key], function(object) {
                    if (object instanceof ParseObject && fetchedObjects[object.id]) {
                        return fetchedObjects[object.id];
                    }
                });
                if (fetched) {
                    self._serverData[key] = fetched;
                }
            });
            this._rebuildAllEstimatedData();
            this._saving = this._saving - 1;
        },

        /**
        * Called when a fetch or login is complete to set the known server data to
        * the given object.
        */
        _finishFetch: function(serverData, hasData) {

            this._opSetQueue = [{}];

            // Bring in all the new server data.
            this._mergeMagicFields(serverData);
            this._copyServerData(serverData);

            this._hasData = hasData;
        },

        /**
        * Applies the set of ParseOp in opSet to the object target.
        */
        _applyOpSet: function(opSet, target) {
            var self = this;
            ParseCore._objectEach(opSet, function(change, key) {
                    target[key] = change._estimate(target[key], self, key);
                    if (target[key] === ParseOp._UNSET) {
                        delete target[key];
                    }
            });
        },

        /**
        * Replaces the cached value for key with the current value.
        * Returns true if the new value is different than the old value.
        */
        _resetCacheForKey: function(key) {
            var value = this.attributes[key];
            if (_.isObject(value) &&
            !(value instanceof ParseObject)) {
                value = value.toJSON ? value.toJSON() : value;
                var json = JSON.stringify(value);
                if (this._hashedJSON[key] !== json) {
                    var wasSet = !!this._hashedJSON[key];
                    this._hashedJSON[key] = json;
                    return wasSet;
                }
            }
            return false;
        },

        /**
        * Populates attributes[key] by starting with the last known data from the
        * server, and applying all of the local changes that have been made to that
        * key since then.
        */
        _rebuildEstimatedDataForKey: function(key) {
            var self = this;
            delete this.attributes[key];
            if (this._serverData[key]) {
                this.attributes[key] = this._serverData[key];
            }
            ParseCore._arrayEach(this._opSetQueue, function(opSet) {
                var op = opSet[key];
                if (op) {
                    self.attributes[key] = op._estimate(self.attributes[key], self, key);
                    if (self.attributes[key] === ParseOp._UNSET) {
                        delete self.attributes[key];
                    } else {
                        self._resetCacheForKey(key);
                    }
                }
            });
        },

        /**
        * Populates attributes by starting with the last known data from the
        * server, and applying all of the local changes that have been made since
        * then.
        */
        _rebuildAllEstimatedData: function() {
            var self = this;

            var previousAttributes = _.clone(this.attributes);

            this.attributes = _.clone(this._serverData);
            ParseCore._arrayEach(this._opSetQueue, function(opSet) {
                    self._applyOpSet(opSet, self.attributes);
                    ParseCore._objectEach(opSet, function(op, key) {
                    self._resetCacheForKey(key);
                });
            });

            // Trigger change events for anything that changed because of the fetch.
            ParseCore._objectEach(previousAttributes, function(oldValue, key) {
                if (self.attributes[key] !== oldValue) {
                    self.trigger('change:' + key, self, self.attributes[key], {});
                }
            });
            ParseCore._objectEach(this.attributes, function(newValue, key) {
                if (!_.has(previousAttributes, key)) {
                self.trigger('change:' + key, self, newValue, {});
                }
            });
        },

        /**
        * Sets a hash of model attributes on the object, firing
        * <code>"change"</code> unless you choose to silence it.
        *
        * <p>You can call it with an object containing keys and values, or with one
        * key and value.  For example:<pre>
        *   gameTurn.set({
        *     player: player1,
        *     diceRoll: 2
        *   }, {
        *     error: function(gameTurnAgain, error) {
        *       // The set failed validation.
        *     }
        *   });
        *
        *   game.set("currentPlayer", player2, {
        *     error: function(gameTurnAgain, error) {
        *       // The set failed validation.
        *     }
        *   });
        *
        *   game.set("finished", true);</pre></p>
        * 
        * @param {String} key The key to set.
        * @param {} value The value to give it.
        * @param {Object} options A set of Backbone-like options for the set.
        *     The only supported options are <code>silent</code>,
        *     <code>error</code>, and <code>promise</code>.
        * @return {Boolean} true if the set succeeded.
        * @see ParseObject#validate
        * @see ParseError
        */
        set: function(key, value, options) {
            var attrs, attr;
            if (_.isObject(key) || ParseCore._isNullOrUndefined(key)) {
                attrs = key;
                ParseCore._objectEach(attrs, function(v, k) {
                attrs[k] = ParseCore._decode(k, v);
                });
                options = value;
            } else {
                attrs = {};
                attrs[key] = ParseCore._decode(key, value);
            }

            // Extract attributes and options.
            options = options || {};
            if (!attrs) {
                return this;
            }
            if (attrs instanceof ParseObject) {
                attrs = attrs.attributes;
            }

            // If the unset option is used, every attribute should be a Unset.
            if (options.unset) {
                ParseCore._objectEach(attrs, function(unused_value, key) {
                    attrs[key] = new ParseOp.Unset();
                });
            }

            // Apply all the attributes to get the estimated values.
            var dataToValidate = _.clone(attrs);
            var self = this;
            ParseCore._objectEach(dataToValidate, function(value, key) {
                if (value instanceof ParseOp) {
                    dataToValidate[key] = value._estimate(self.attributes[key],
                        self, key);
                    if (dataToValidate[key] === ParseOp._UNSET) {
                        delete dataToValidate[key];
                    }
                }
            });

            // Run validation.
            if (!this._validate(attrs, options)) {
                return false;
            }

            this._mergeMagicFields(attrs);

            options.changes = {};
            var escaped = this._escapedAttributes;
            var prev = this._previousAttributes || {};

            // Update attributes.
            ParseCore._arrayEach(_.keys(attrs), function(attr) {
                var val = attrs[attr];

                // If this is a relation object we need to set the parent correctly,
                // since the location where it was parsed does not have access to
                // this object.
                if (val instanceof $injector.get('ParseRelation')) {
                    val.parent = self;
                }

                if (!(val instanceof ParseOp)) {
                    val = new ParseOp.Set(val);
                }

                // See if this change will actually have any effect.
                var isRealChange = true;
                if (val instanceof ParseOp.Set &&
                _.isEqual(self.attributes[attr], val.value)) {
                    isRealChange = false;
                }

                if (isRealChange) {
                    delete escaped[attr];
                    if (options.silent) {
                        self._silent[attr] = true;
                    } else {
                        options.changes[attr] = true;
                    }
                }

                var currentChanges = _.last(self._opSetQueue);
                currentChanges[attr] = val._mergeWithPrevious(currentChanges[attr]);
                self._rebuildEstimatedDataForKey(attr);

                if (isRealChange) {
                    self.changed[attr] = self.attributes[attr];
                    if (!options.silent) {
                       self._pending[attr] = true;
                    }
                } else {
                    delete self.changed[attr];
                    delete self._pending[attr];
                }
            });

            if (!options.silent) {
                this.change(options);
            }
            return this;
        },

        /**
        * Remove an attribute from the model, firing <code>"change"</code> unless
        * you choose to silence it. This is a noop if the attribute doesn't
        * exist.
        */
        unset: function(attr, options) {
            options = options || {};
            options.unset = true;
            return this.set(attr, null, options);
        },

        /**
        * Atomically increments the value of the given attribute the next time the
        * object is saved. If no amount is specified, 1 is used by default.
        *
        * @param attr {String} The key.
        * @param amount {Number} The amount to increment by.
        */
        increment: function(attr, amount) {
            if (_.isUndefined(amount) || _.isNull(amount)) {
                amount = 1;
            }
            return this.set(attr, new ParseOp.Increment(amount));
        },

        /**
        * Atomically add an object to the end of the array associated with a given
        * key.
        * @param attr {String} The key.
        * @param item {} The item to add.
        */
        add: function(attr, item) {
            return this.set(attr, new ParseOp.Add([item]));
        },

        /**
        * Atomically add an object to the array associated with a given key, only
        * if it is not already present in the array. The position of the insert is
        * not guaranteed.
        *
        * @param attr {String} The key.
        * @param item {} The object to add.
        */
        addUnique: function(attr, item) {
            return this.set(attr, new ParseOp.AddUnique([item]));
        },

        /**
        * Atomically remove all instances of an object from the array associated
        * with a given key.
        *
        * @param attr {String} The key.
        * @param item {} The object to remove.
        */
        remove: function(attr, item) {
            return this.set(attr, new ParseOp.Remove([item]));
        },

        /**
        * Returns an instance of a subclass of ParseOp describing what kind of
        * modification has been performed on this field since the last time it was
        * saved. For example, after calling object.increment("x"), calling
        * object.op("x") would return an instance of ParseOp.Increment.
        *
        * @param attr {String} The key.
        * @returns {ParseOp} The operation, or undefined if none.
        */
        op: function(attr) {
            return _.last(this._opSetQueue)[attr];
        },

        /**
        * Clear all attributes on the model, firing <code>"change"</code> unless
        * you choose to silence it.
        */
        clear: function(options) {
            options = options || {};
            options.unset = true;
            var keysToClear = _.extend(this.attributes, this._operations);
            return this.set(keysToClear, options);
        },

        /**
        * Returns a JSON-encoded set of operations to be sent with the next save
        * request.
        */
        _getSaveJSON: function() {
            var json = _.clone(_.first(this._opSetQueue));
            ParseCore._objectEach(json, function(op, key) {
                json[key] = op.toJSON();
            });
            return json;
        },

        /**
        * Returns true if this object can be serialized for saving.
        */
        _canBeSerialized: function() {
            return ParseObject._canBeSerializedAsValue(this.attributes);
        },

        /**
        * Fetch the model from the server. If the server's representation of the
        * model differs from its current attributes, they will be overriden,
        * triggering a <code>"change"</code> event.
        *
        * @param {Object} options A Backbone-style callback object.
        * Valid options are:<ul>
        *   <li>success: A Backbone-style success callback.
        *   <li>error: An Backbone-style error callback.
        *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
        *     be used for this request.
        * </ul>
        * @return {ParseCore.Promise} A promise that is fulfilled when the fetch
        *     completes.
        */
        fetch: function(options) {
            var self = this;
            options = options || {};
            var request = ParseCore._request({
                method: 'GET',
                route: "classes",
                className: this.className,
                objectId: this.id,
                useMasterKey: options.useMasterKey
            });
            return request.then(function(response, status, xhr) {
                self._finishFetch(self.parse(response, status, xhr), true);
                return self;
            })
            // ._thenRunCallbacks(options, this);
        },

        /**
        * Set a hash of model attributes, and save the model to the server.
        * updatedAt will be updated when the request returns.
        * You can either call it as:<pre>
        *   object.save();</pre>
        * or<pre>
        *   object.save(null, options);</pre>
        * or<pre>
        *   object.save(attrs, options);</pre>
        * or<pre>
        *   object.save(key, value, options);</pre>
        *
        * For example, <pre>
        *   gameTurn.save({
        *     player: "Jake Cutter",
        *     diceRoll: 2
        *   }, {
        *     success: function(gameTurnAgain) {
        *       // The save was successful.
        *     },
        *     error: function(gameTurnAgain, error) {
        *       // The save failed.  Error is an instance of ParseError.
        *     }
        *   });</pre>
        * or with promises:<pre>
        *   gameTurn.save({
        *     player: "Jake Cutter",
        *     diceRoll: 2
        *   }).then(function(gameTurnAgain) {
        *     // The save was successful.
        *   }, function(error) {
        *     // The save failed.  Error is an instance of ParseError.
        *   });</pre>
        * 
        * @param {Object} options A Backbone-style callback object.
        * Valid options are:<ul>
        *   <li>wait: Set to true to wait for the server to confirm a successful
        *   save before modifying the attributes on the object.
        *   <li>silent: Set to true to avoid firing the `set` event.
        *   <li>success: A Backbone-style success callback.
        *   <li>error: An Backbone-style error callback.
        *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
        *     be used for this request.
        * </ul>
        * @return {ParseCore.Promise} A promise that is fulfilled when the save
        *     completes.
        * @see ParseError
        */
        save: function(arg1, arg2, arg3) {
            var i, attrs, current, options, saved;
            if (_.isObject(arg1) || ParseCore._isNullOrUndefined(arg1)) {
                attrs = arg1;
                options = arg2;
            } else {
                attrs = {};
                attrs[arg1] = arg2;
                options = arg3;
            }

            // Make save({ success: function() {} }) work.
            if (!options && attrs) {
                var extra_keys = _.reject(attrs, function(value, key) {
                    return _.include(["success", "error", "wait"], key);
                });
                if (extra_keys.length === 0) {
                    var all_functions = true;
                    if (_.has(attrs, "success") && !_.isFunction(attrs.success)) {
                        all_functions = false;
                    }
                    if (_.has(attrs, "error") && !_.isFunction(attrs.error)) {
                        all_functions = false;
                    }
                    if (all_functions) {
                        // This attrs object looks like it's really an options object,
                        // and there's no other options object, so let's just use it.
                        return this.save(null, attrs);
                    }
                }
            }

            options = _.clone(options) || {};
            if (options.wait) {
                current = _.clone(this.attributes);
            }

            var setOptions = _.clone(options) || {};
            if (setOptions.wait) {
                setOptions.silent = true;
            }
            var setError;
            setOptions.error = function(model, error) {
                setError = error;
            };
            if (attrs && !this.set(attrs, setOptions)) {
                return $q.reject(setError)
                // ._thenRunCallbacks(options, this);
            }

            var model = this;

            // If there is any unsaved child, save it first.
            model._refreshCache();


            var unsavedChildren = [];
            var unsavedFiles = [];
            ParseObject._findUnsavedChildren(model.attributes,
            unsavedChildren,
            unsavedFiles);

            if (unsavedChildren.length + unsavedFiles.length > 0) {
                return ParseObject._deepSaveAsync(this.attributes, {
                    useMasterKey: options.useMasterKey
                }).then(function() {
                    return model.save(null, options);
                }, function(error) {
                    return $q.reject(error)
                    // ._thenRunCallbacks(options, model);
                });
            }

            this._startSave();
            this._saving = (this._saving || 0) + 1;

            var defer = $q.defer();
            defer.resolve();

            this._allPreviousSaves = this._allPreviousSaves || defer.promise;
            this._allPreviousSaves = this._allPreviousSaves.then(function() {
                var method = model.id ? 'PUT' : 'POST';

                var json = model._getSaveJSON();

                var route = "classes";
                var className = model.className;
                if (model.className === "_User" && !model.id) {
                    // Special-case user sign-up.
                    route = "users";
                    className = null;
                }
                var request = ParseCore._request({
                    route: route,
                    className: className,
                    objectId: model.id,
                    method: method,
                    useMasterKey: options.useMasterKey,
                    data: json
                });

                request = request.then(function(resp, status, xhr) {
                    var serverAttrs = model.parse(resp, status, xhr);
                    if (options.wait) {
                    serverAttrs = _.extend(attrs || {}, serverAttrs);
                    }
                    model._finishSave(serverAttrs);
                    if (options.wait) {
                    model.set(current, setOptions);
                    }
                    return model;

                }, function(error) {
                    model._cancelSave();
                    return $q.reject(error);

                })
                // ._thenRunCallbacks(options, model);

                return request;
            });
            return this._allPreviousSaves;
        },

        /**
        * Destroy this model on the server if it was already persisted.
        * Optimistically removes the model from its collection, if it has one.
        * If `wait: true` is passed, waits for the server to respond
        * before removal.
        *
        * @param {Object} options A Backbone-style callback object.
        * Valid options are:<ul>
        *   <li>wait: Set to true to wait for the server to confirm successful
        *   deletion of the object before triggering the `destroy` event.
        *   <li>success: A Backbone-style success callback
        *   <li>error: An Backbone-style error callback.
        *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
        *     be used for this request.
        * </ul>
        * @return {ParseCore.Promise} A promise that is fulfilled when the destroy
        *     completes.
        */
        destroy: function(options) {
            options = options || {};
            var model = this;

            var triggerDestroy = function() {
                model.trigger('destroy', model, model.collection, options);
            };

            if (!this.id) {
                return triggerDestroy();
            }

            if (!options.wait) {
                triggerDestroy();
            }

            var request = ParseCore._request({
                route: "classes",
                className: this.className,
                objectId: this.id,
                method: 'DELETE',
                useMasterKey: options.useMasterKey
            });
            return request.then(function() {
                if (options.wait) {
                    triggerDestroy();
                }
                return model;
            })
            // ._thenRunCallbacks(options, this);
        },

        /**
        * Converts a response into the hash of attributes to be set on the model.
        * @ignore
        */
        parse: function(resp, status, xhr) {
            var output = _.clone(resp);
            _(["createdAt", "updatedAt"]).each(function(key) {
                if (output[key]) {
                    output[key] = ParseCore._parseDate(output[key]);
                }
            });
            if (!output.updatedAt) {
                output.updatedAt = output.createdAt;
            }
            if (status) {
                this._existed = (status !== 201);
            }
            return output;
        },

        /**
        * Creates a new model with identical attributes to this one.
        * @return {ParseObject}
        */
        clone: function() {
            return new this.constructor(this.attributes);
        },

        /**
        * Returns true if this object has never been saved to ParseCore.
        * @return {Boolean}
        */
        isNew: function() {
            return !this.id;
        },

        /**
        * Call this method to manually fire a `"change"` event for this model and
        * a `"change:attribute"` event for each changed attribute.
        * Calling this will cause all objects observing the model to update.
        */
        change: function(options) {
            options = options || {};
            var changing = this._changing;
            this._changing = true;

            // Silent changes become pending changes.
            var self = this;
            ParseCore._objectEach(this._silent, function(attr) {
                self._pending[attr] = true;
            });

            // Silent changes are triggered.
            var changes = _.extend({}, options.changes, this._silent);
            this._silent = {};
            ParseCore._objectEach(changes, function(unused_value, attr) {
                self.trigger('change:' + attr, self, self.get(attr), options);
            });
            if (changing) {
                return this;
            }

            // This is to get around lint not letting us make a function in a loop.
            var deleteChanged = function(value, attr) {
                if (!self._pending[attr] && !self._silent[attr]) {
                    delete self.changed[attr];
                }
            };

            // Continue firing `"change"` events while there are pending changes.
            while (!_.isEmpty(this._pending)) {
                this._pending = {};
                this.trigger('change', this, options);
                // Pending and silent changes still remain.
                ParseCore._objectEach(this.changed, deleteChanged);
                self._previousAttributes = _.clone(this.attributes);
            }

            this._changing = false;
            return this;
        },

        /**
        * Returns true if this object was created by the Parse server when the
        * object might have already been there (e.g. in the case of a Facebook
        * login)
        */
        existed: function() {
            return this._existed;
        },

        /**
        * Determine if the model has changed since the last <code>"change"</code>
        * event.  If you specify an attribute name, determine if that attribute
        * has changed.
        * @param {String} attr Optional attribute name
        * @return {Boolean}
        */
        hasChanged: function(attr) {
            if (!arguments.length) {
                return !_.isEmpty(this.changed);
            }
            return this.changed && _.has(this.changed, attr);
        },

        /**
        * Returns an object containing all the attributes that have changed, or
        * false if there are no changed attributes. Useful for determining what
        * parts of a view need to be updated and/or what attributes need to be
        * persisted to the server. Unset attributes will be set to undefined.
        * You can also pass an attributes object to diff against the model,
        * determining if there *would be* a change.
        */
        changedAttributes: function(diff) {
            if (!diff) {
                return this.hasChanged() ? _.clone(this.changed) : false;
            }
            var changed = {};
            var old = this._previousAttributes;
            ParseCore._objectEach(diff, function(diffVal, attr) {
                if (!_.isEqual(old[attr], diffVal)) {
                    changed[attr] = diffVal;
                }
            });
            return changed;
        },

        /**
        * Gets the previous value of an attribute, recorded at the time the last
        * <code>"change"</code> event was fired.
        * @param {String} attr Name of the attribute to get.
        */
        previous: function(attr) {
            if (!arguments.length || !this._previousAttributes) {
                return null;
            }
            return this._previousAttributes[attr];
        },

        /**
        * Gets all of the attributes of the model at the time of the previous
        * <code>"change"</code> event.
        * @return {Object}
        */
        previousAttributes: function() {
            return _.clone(this._previousAttributes);
        },

        /**
        * Checks if the model is currently in a valid state. It's only possible to
        * get into an *invalid* state if you're using silent changes.
        * @return {Boolean}
        */
        isValid: function() {
            return !this.validate(this.attributes);
        },

        /**
        * You should not call this function directly unless you subclass
        * <code>ParseObject</code>, in which case you can override this method
        * to provide additional validation on <code>set</code> and
        * <code>save</code>.  Your implementation should return 
        *
        * @param {Object} attrs The current data to validate.
        * @param {Object} options A Backbone-like options object.
        * @return {} False if the data is valid.  An error object otherwise.
        * @see ParseObject#set
        */
        validate: function(attrs, options) {
            if (_.has(attrs, "ACL") && !(attrs.ACL instanceof ParseACL)) {
                return new ParseError(ParseError.OTHER_CAUSE,
                "ACL must be a ParseCore.ACL.");
            }
            var correct = true;
            ParseCore._objectEach(attrs, function(unused_value, key) {
                if (!(/^[A-Za-z][0-9A-Za-z_]*$/).test(key)) {
                    correct = false;
                }
            });
            if (!correct) {
                return new ParseError(ParseError.INVALID_KEY_NAME); 
            }
            return false;
        },

        /**
        * Run validation against a set of incoming attributes, returning `true`
        * if all is well. If a specific `error` callback has been passed,
        * call that instead of firing the general `"error"` event.
        */
        _validate: function(attrs, options) {
            if (options.silent || !this.validate) {
                return true;
            }
            attrs = _.extend({}, this.attributes, attrs);
            var error = this.validate(attrs, options);
            if (!error) {
                return true;
            }
            if (options && options.error) {
                options.error(this, error, options);
            } else {
                this.trigger('error', this, error, options);
            }
            return false;
        },

        /**
        * Returns the ACL for this object.
        * @returns {ParseCore.ACL} An instance of ParseCore.ACL.
        * @see ParseObject#get
        */
        getACL: function() {
            return this.get("ACL");
        },

        /**
        * Sets the ACL to be used for this object.
        * @param {ParseCore.ACL} acl An instance of ParseCore.ACL.
        * @param {Object} options Optional Backbone-like options object to be
        *     passed in to set.
        * @return {Boolean} Whether the set passed validation.
        * @see ParseObject#set
        */
        setACL: function(acl, options) {
            return this.set("ACL", acl, options);
        }

    });

    /**
    * Returns the appropriate subclass for making new instances of the given
    * className string.
    */
    ParseObject._getSubclass = function(className) {
        if (!_.isString(className)) {
            throw "ParseObject._getSubclass requires a string argument.";
        }
        var ObjectClass = ParseObject._classMap[className];
        if (!ObjectClass) {
            ObjectClass = ParseObject.extend(className);
            ParseObject._classMap[className] = ObjectClass;
        }
        return ObjectClass;
    };

    /**
    * Creates an instance of a subclass of ParseObject for the given classname.
    */
    ParseObject._create = function(className, attributes, options) {
        var ObjectClass = ParseObject._getSubclass(className);
        return new ObjectClass(attributes, options);
    };

    /**
    * Returns a list of object ids given a list of objects.
    */
    ParseObject._toObjectIdArray = function(list, omitObjectsWithData) {
        var defer = $q.defer();
        defer.resolve(list);
        if (list.length === 0) {
            return defer.promise;
        }

        var error;
        var className = list[0].className;
        var objectIds = [];   
        for (var i = 0; i < list.length; i++) {
            var object = list[i];
            if (className !== object.className) {
                error = new ParseError(ParseError.INVALID_CLASS_NAME, 
                "All objects should be of the same class");
                return $q.reject(error);
            } else if (!object.id) {
                error = new ParseError(ParseError.MISSING_OBJECT_ID,
                "All objects must have an ID");
                return $q.reject(error);
            } else if (omitObjectsWithData && object._hasData) {
                continue;
            }
            objectIds.push(object.id);
        }

        var defer = $q.defer();
        defer.resolve(objectIds);

        return defer.promise;
    };

    /**
    * Updates a list of objects with fetched results.
    */
    ParseObject._updateWithFetchedResults = function(list, fetched, forceFetch) {
        var fetchedObjectsById = {};
        ParseCore._arrayEach(fetched, function(object, i) {
            fetchedObjectsById[object.id] = object;
        });

        for (var i = 0; i < list.length; i++) {
            var object = list[i];  
            var fetchedObject = fetchedObjectsById[object.id];
            if (!fetchedObject && forceFetch) {
                var error = new ParseError(ParseError.OBJECT_NOT_FOUND,
                "All objects must exist on the server");
                return $q.reject(error);        
            }   

            object._mergeFromObject(fetchedObject);
        }

        return ParseCore.Promise.as(list);
    };  

    /**
    * Fetches the objects given in list.  The forceFetch option will fetch all
    * objects if true and ignore objects with data if false.
    */
    ParseObject._fetchAll = function(list, forceFetch) {    
        var defer = $q.defer();
        defer.resolve(list);
        if (list.length === 0) {
            return defer.promise;
        } 

        var omitObjectsWithData = !forceFetch;
        return ParseObject._toObjectIdArray(
            list, 
            omitObjectsWithData
        ).then(function(objectIds) {
            var className = list[0].className;
            var query = new ParseQuery(className);
            query.containedIn("objectId", objectIds);
            query.limit = objectIds.length;
            return query.find();
        }).then(function(results) {
            return ParseObject._updateWithFetchedResults(
                list, 
                results, 
                forceFetch
            );
        });   
    };  

    // Set up a map of className to class so that we can create new instances of
    // Parse Objects from JSON automatically.
    ParseObject._classMap = {};

    ParseObject._extend = ParseCore._extend;

    /**
    * Creates a new subclass of ParseObject for the given Parse class name.
    *
    * <p>Every extension of a Parse class will inherit from the most recent
    * previous extension of that class. When a ParseObject is automatically
    * created by parsing JSON, it will use the most recent extension of that
    * class.</p>
    *
    * <p>You should call either:<pre>
    *     var MyClass = ParseObject.extend("MyClass", {
    *         <i>Instance methods</i>,
    *         initialize: function(attrs, options) {
    *             this.someInstanceProperty = [],
    *             <i>Other instance properties</i>
    *         }
    *     }, {
    *         <i>Class properties</i>
    *     });</pre>
    * or, for Backbone compatibility:<pre>
    *     var MyClass = ParseObject.extend({
    *         className: "MyClass",
    *         <i>Instance methods</i>,
    *         initialize: function(attrs, options) {
    *             this.someInstanceProperty = [],
    *             <i>Other instance properties</i>
    *         }
    *     }, {
    *         <i>Class properties</i>
    *     });</pre></p>
    *
    * @param {String} className The name of the Parse class backing this model.
    * @param {Object} protoProps Instance properties to add to instances of the
    *     class returned from this method.
    * @param {Object} classProps Class properties to add the class returned from
    *     this method.
    * @return {Class} A new subclass of ParseObject.
    */
    ParseObject.extend = function(className, protoProps, classProps) {
        // Handle the case with only two args.
        if (!_.isString(className)) {
            if (className && _.has(className, "className")) {
                return ParseObject.extend(className.className, className, protoProps);
            } else {
                throw new Error(
                "ParseObject.extend's first argument should be the className.");
            }
        }


        // If someone tries to subclass "User", coerce it to the right type.
        if (className === "User" && $injector.get('ParseUser')._performUserRewrite) {
            className = "_User";
        }
        protoProps = protoProps || {};
        protoProps.className = className;

        var NewClassObject = null;
        if (_.has(ParseObject._classMap, className)) {
        var OldClassObject = ParseObject._classMap[className];
            // This new subclass has been told to extend both from "this" and from
            // OldClassObject. This is multiple inheritance, which isn't supported.
            // For now, let's just pick one.
            NewClassObject = OldClassObject._extend(protoProps, classProps);
        } else {
            NewClassObject = this._extend(protoProps, classProps);
        }
        // Extending a subclass should reuse the classname automatically.
        NewClassObject.extend = function(arg0) {
            if (_.isString(arg0) || (arg0 && _.has(arg0, "className"))) {
                return ParseObject.extend.apply(NewClassObject, arguments);
            }
            var newArguments = [className].concat(ParseCore._.toArray(arguments));
            return ParseObject.extend.apply(NewClassObject, newArguments);
        };
        ParseObject._classMap[className] = NewClassObject;
        return NewClassObject;
    };

    ParseObject._findUnsavedChildren = function(object, children, files) {
        ParseCore._traverse(object, function(object) {
            if (object instanceof ParseObject) {
                object._refreshCache();
                if (object.dirty()) {
                    children.push(object);
                }
                return;
            }

            // if (object instanceof ParseCore.File) {
            //     if (!object.url()) {
            //         files.push(object);
            //     }
            //     return;
            // }
        });
    };

    ParseObject._canBeSerializedAsValue = function(object) {

        if (object instanceof ParseObject) {
        return !!object.id;
        }
        // if (object instanceof ParseCore.File) {
        // // Don't recurse indefinitely into files.
        // return true;
        // }

        var canBeSerializedAsValue = true;

        if (_.isArray(object)) {
            ParseCore._arrayEach(object, function(child) {
                if (!ParseObject._canBeSerializedAsValue(child)) {
                    canBeSerializedAsValue = false;
                }
            });
        } else if (_.isObject(object)) {
            ParseCore._objectEach(object, function(child) {
                if (!ParseObject._canBeSerializedAsValue(child)) {
                    canBeSerializedAsValue = false;
                }
            });
        }
        return canBeSerializedAsValue;
    };

    /**
    * @param {Object} object The root object.
    * @param {Object} options: The only valid option is useMasterKey.
    */
    ParseObject._deepSaveAsync = function(object, options) {
        var unsavedChildren = [];
        var unsavedFiles = [];
        ParseObject._findUnsavedChildren(object, unsavedChildren, unsavedFiles);

        var defer = $q.defer();
        defer.resolve();
        var promise = defer.promise;
        _.each(unsavedFiles, function(file) {
            promise = promise.then(function() {
                return file.save(options);
            });
        });

        var objects = _.uniq(unsavedChildren);
        var remaining = _.uniq(objects);

        return promise.then(function() {
            return ParseCore._continueWhile(function() {
                return remaining.length > 0;
            }, function() {
                // Gather up all the objects that can be saved in this batch.
                var batch = [];
                var newRemaining = [];
                ParseCore._arrayEach(remaining, function(object) {
                    // Limit batches to 20 objects.
                    if (batch.length > 20) {
                        newRemaining.push(object);
                    return;
                    }

                    if (object._canBeSerialized()) {
                        batch.push(object);
                    } else {
                        newRemaining.push(object);
                    }
                });
                remaining = newRemaining;

                // If we can't save any objects, there must be a circular reference.
                if (batch.length === 0) {
                    return $q.reject( 
                        new ParseError(ParseError.OTHER_CAUSE,
                    "Tried to save a batch with a cycle."));
                }

                // Reserve a spot in every object's save queue.
                var readyToStart = $q.all(_.map(batch, function(object) {
                    if (object._allPreviousSaves) {
                        return object._allPreviousSaves;
                    }
                    else {
                        var defer = $q.defer();
                        defer.resolve();
                        return defer.promise;
                    }
                }));
                var batchFinishedDefer = $q.defer();
                var batchFinished = batchFinishedDefer.promise;

                ParseCore._arrayEach(batch, function(object) {
                    object._allPreviousSaves = batchFinished;
                });

                // Save a single batch, whether previous saves succeeded or failed.
                return readyToStart._continueWith(function() {
                    return ParseCore._request({
                        route: "batch",
                        method: "POST",
                        useMasterKey: options.useMasterKey,
                        data: {
                            requests: _.map(batch, function(object) {
                                var json = object._getSaveJSON();
                                var method = "POST";

                                var path = "/1/classes/" + object.className;
                                if (object.id) {
                                    path = path + "/" + object.id;
                                    method = "PUT";
                                }

                                object._startSave();

                                return {
                                    method: method,
                                    path: path,
                                    body: json
                                };
                            })
                        }
                    })
                    .then(function(response, status, xhr) {
                        var error;
                        ParseCore._arrayEach(batch, function(object, i) {
                            if (response[i].success) {
                                object._finishSave(
                                object.parse(response[i].success, status, xhr));
                            } else {
                                error = error || response[i].error;
                                object._cancelSave();
                            }
                        });
                        if (error) {
                            return $q.reject(
                                new ParseError(error.code, error.error)
                            );
                        }
                    })
                    .then(function(results) {
                        batchFinished.resolve(results);
                        return results;
                    }, function(error) {
                        batchFinished.reject(error);
                        return $q.reject(error);
                    });
                });
            });
        }).then(function() {
            return object;
        });
    };

    return ParseObject;
});