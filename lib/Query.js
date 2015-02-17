var module = angular.module('ParseAngular.Query', [
    'ParseAngular.Object',
    'ParseAngular.Core',
    'ParseAngular.GeoPoint',
    'ParseAngular.Error'
]);
module.factory('ParseQuery', function(ParseObject, ParseCore, ParseGeoPoint, ParseError, $q, $injector){

    var ParseQuery;

    /**
    * Creates a new parse ParseQuery for the given ParseObject subclass.
    * @param objectClass -
    *   An instance of a subclass of ParseObject, or a Parse className string.
    * @class
    *
    * <p>ParseQuery defines a query that is used to fetch ParseObjects. The
    * most common use case is finding all objects that match a query through the
    * <code>find</code> method. For example, this sample code fetches all objects
    * of class <code>MyClass</code>. It calls a different function depending on
    * whether the fetch succeeded or not.
    * 
    * <pre>
    * var query = new ParseQuery(MyClass);
    * query.find({
    *   success: function(results) {
    *     // results is an array of ParseObject.
    *   },
    *
    *   error: function(error) {
    *     // error is an instance of ParseError.
    *   }
    * });</pre></p>
    * 
    * <p>A ParseQuery can also be used to retrieve a single object whose id is
    * known, through the get method. For example, this sample code fetches an
    * object of class <code>MyClass</code> and id <code>myId</code>. It calls a
    * different function depending on whether the fetch succeeded or not.
    * 
    * <pre>
    * var query = new ParseQuery(MyClass);
    * query.get(myId, {
    *   success: function(object) {
    *     // object is an instance of ParseObject.
    *   },
    *
    *   error: function(object, error) {
    *     // error is an instance of ParseError.
    *   }
    * });</pre></p>
    * 
    * <p>A ParseQuery can also be used to count the number of objects that match
    * the query without retrieving all of those objects. For example, this
    * sample code counts the number of objects of the class <code>MyClass</code>
    * <pre>
    * var query = new ParseQuery(MyClass);
    * query.count({
    *   success: function(number) {
    *     // There are number instances of MyClass.
    *   },
    *
    *   error: function(error) {
    *     // error is an instance of ParseError.
    *   }
    * });</pre></p>
    */
    ParseQuery = function(objectClass) {
        if (_.isString(objectClass)) {
            objectClass = ParseObject._getSubclass(objectClass);
        }

        this.objectClass = objectClass;

        this.className = objectClass.prototype.className;

        this._where = {};
        this._include = [];
        this._limit = -1; // negative limit means, do not send a limit
        this._skip = 0;
        this._extraOptions = {};
    };

    /**
    * Constructs a ParseQuery that is the OR of the passed in queries.  For
    * example:
    * <pre>var compoundQuery = ParseQuery.or(query1, query2, query3);</pre>
    *
    * will create a compoundQuery that is an or of the query1, query2, and
    * query3.
    * @param {...ParseQuery} var_args The list of queries to OR.
    * @return {ParseQuery} The query that is the OR of the passed in queries.
    */
    ParseQuery.or = function() {
        var queries = _.toArray(arguments);
        var className = null;
        ParseCore._arrayEach(queries, function(q) {
            if (_.isNull(className)) {
                className = q.className;
            }   

            if (className !== q.className) {
                throw "All queries must be for the same class";
            }
        });
        var query = new ParseQuery(className);
        query._orQuery(queries);
        return query;
    };

    ParseQuery.prototype = {
        /**
        * Constructs a ParseObject whose id is already known by fetching data from
        * the server.  Either options.success or options.error is called when the
        * find completes.
        *
        * @param {String} objectId The id of the object to be fetched.
        * @param {Object} options A Backbone-style options object.
        * Valid options are:<ul>
        *   <li>success: A Backbone-style success callback
        *   <li>error: An Backbone-style error callback.
        *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
        *     be used for this request.
        * </ul>
        */
        get: function(objectId, options) {
            var self = this;
            self.equalTo('objectId', objectId);

            var firstOptions = {};
            if (options && _.has(options, 'useMasterKey')) {
                firstOptions = { useMasterKey: options.useMasterKey };
            }

            return self.first(firstOptions).then(function(response) {
                if (response) {
                    return response;
                }
                var errorObject = new ParseError(ParseError.OBJECT_NOT_FOUND,
                      "Object not found.");
                return $q.reject(errorObject);

            })
            // ._thenRunCallbacks(options, null);
        },

        /**
        * Returns a JSON representation of this query.
        * @return {Object} The JSON representation of the query.
        */
        toJSON: function() {
            var params = {
                where: this._where
            };

            if (this._include.length > 0) {
                params.include = this._include.join(",");
            }
            if (this._select) {
                params.keys = this._select.join(",");
            }
            if (this._limit >= 0) {
                params.limit = this._limit;
            }
            if (this._skip > 0) {
                params.skip = this._skip;
            }
            if (this._order !== undefined) {
                params.order = this._order.join(",");
            }

            ParseCore._objectEach(this._extraOptions, function(v, k) {
                params[k] = v;
            });

            return params;
        },

        /**
        * Retrieves a list of ParseObjects that satisfy this query.
        * Either options.success or options.error is called when the find
        * completes.
        *
        * @param {Object} options A Backbone-style options object. Valid options
        * are:<ul>
        *   <li>success: Function to call when the find completes successfully.
        *   <li>error: Function to call when the find fails.
        *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
        *     be used for this request.
        * </ul>
        *
        * @return {Parse.Promise} A promise that is resolved with the results when
        * the query completes.
        */
        find: function(options) {
            var self = this;
            options = options || {};

            var request = ParseCore._request({
                route: "classes",
                className: this.className,
                method: "GET",
                useMasterKey: options.useMasterKey,
                data: this.toJSON()
            });

            return request.then(function(response) {
                return _.map(response.results, function(json) {
                    var obj;
                    if (response.className) {
                        obj = new ParseObject(response.className);
                    } else {
                        obj = new self.objectClass();
                    }
                    obj._finishFetch(json, true);
                    return obj;
                });
            })
            // ._thenRunCallbacks(options);
        },

        /**
        * Counts the number of objects that match this query.
        * Either options.success or options.error is called when the count
        * completes.
        *
        * @param {Object} options A Backbone-style options object. Valid options
        * are:<ul>
        *   <li>success: Function to call when the count completes successfully.
        *   <li>error: Function to call when the find fails.
        *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
        *     be used for this request.
        * </ul>
        *
        * @return {Parse.Promise} A promise that is resolved with the count when
        * the query completes.
        */
        count: function(options) {
            var self = this;
            options = options || {};

            var params = this.toJSON();
            params.limit = 0;
            params.count = 1;
            var request = ParseCore._request({
                route: "classes",
                className: self.className, 
                method: "GET",
                useMasterKey: options.useMasterKey,
                data: params
            });

            return request.then(function(response) {
                return response.count;
            })
            // ._thenRunCallbacks(options);
        },

        /**
        * Retrieves at most one ParseObject that satisfies this query.
        *
        * Either options.success or options.error is called when it completes.
        * success is passed the object if there is one. otherwise, undefined.
        *
        * @param {Object} options A Backbone-style options object. Valid options
        * are:<ul>
        *   <li>success: Function to call when the find completes successfully.
        *   <li>error: Function to call when the find fails.
        *   <li>useMasterKey: In Cloud Code and Node only, causes the Master Key to
        *     be used for this request.
        * </ul>
        *
        * @return {Parse.Promise} A promise that is resolved with the object when
        * the query completes.
        */
        first: function(options) {
            var self = this;
            options = options || {};

            var params = this.toJSON();
            params.limit = 1;
            var request = ParseCore._request({
                route: "classes",
                className: this.className, 
                method: "GET",
                useMasterKey: options.useMasterKey,
                data: params
            });

            return request.then(function(response) {
                return _.map(response.results, function(json) {
                    var obj;
                    if (response.className) {
                        obj = new ParseObject(response.className);
                    } else {
                        obj = new self.objectClass();
                    }
                    obj._finishFetch(json, true);
                    return obj;
                })[0];
            })
            // ._thenRunCallbacks(options);
        },

        /**
        * Returns a new instance of ParseCollection backed by this query.
        * @param {Array} items An array of instances of <code>ParseObject</code>
        *     with which to start this Collection.
        * @param {Object} options An optional object with Backbone-style options.
        * Valid options are:<ul>
        *   <li>model: The ParseObject subclass that this collection contains.
        *   <li>query: An instance of ParseQuery to use when fetching items.
        *   <li>comparator: A string property name or function to sort by.
        * </ul>
        * @return {ParseCollection}
        */
        collection: function(items, options) {
            options = options || {};
            var ParseCollection = $injector.get('ParseCollection');
            return new ParseCollection(items, _.extend(options, {
                model: this.objectClass,
                query: this
            }));
        },

        /**
        * Sets the number of results to skip before returning any results.
        * This is useful for pagination.
        * Default is to skip zero results.
        * @param {Number} n the number of results to skip.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        skip: function(n) {
            this._skip = n;
            return this;
        },

        /**
        * Sets the limit of the number of results to return. The default limit is
        * 100, with a maximum of 1000 results being returned at a time.
        * @param {Number} n the number of results to limit to.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        limit: function(n) {
            this._limit = n;
            return this;
        },

        /**
        * Add a constraint to the query that requires a particular key's value to
        * be equal to the provided value.
        * @param {String} key The key to check.
        * @param value The value that the ParseObject must contain.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        equalTo: function(key, value) {
            if (_.isUndefined(value)) {
                return this.doesNotExist(key);
            } 

            this._where[key] = ParseCore._encode(value);
            return this;
        },

        /**
        * Helper for condition queries
        */
        _addCondition: function(key, condition, value) {
        // Check if we already have a condition
            if (!this._where[key]) {
                this._where[key] = {};
            }
            this._where[key][condition] = ParseCore._encode(value);
            return this;
        },

        /**
        * Add a constraint to the query that requires a particular key's value to
        * be not equal to the provided value.
        * @param {String} key The key to check.
        * @param value The value that must not be equalled.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        notEqualTo: function(key, value) {
            this._addCondition(key, "$ne", value);
            return this;
        },

        /**
        * Add a constraint to the query that requires a particular key's value to
        * be less than the provided value.
        * @param {String} key The key to check.
        * @param value The value that provides an upper bound.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        lessThan: function(key, value) {
            this._addCondition(key, "$lt", value);
            return this;
        },

        /**
        * Add a constraint to the query that requires a particular key's value to
        * be greater than the provided value.
        * @param {String} key The key to check.
        * @param value The value that provides an lower bound.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        greaterThan: function(key, value) {
            this._addCondition(key, "$gt", value);
            return this;
        },

        /**
        * Add a constraint to the query that requires a particular key's value to
        * be less than or equal to the provided value.
        * @param {String} key The key to check.
        * @param value The value that provides an upper bound.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        lessThanOrEqualTo: function(key, value) {
            this._addCondition(key, "$lte", value);
            return this;
        },

        /**
        * Add a constraint to the query that requires a particular key's value to
        * be greater than or equal to the provided value.
        * @param {String} key The key to check.
        * @param value The value that provides an lower bound.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        greaterThanOrEqualTo: function(key, value) {
            this._addCondition(key, "$gte", value);
            return this;
        },

        /**
        * Add a constraint to the query that requires a particular key's value to
        * be contained in the provided list of values.
        * @param {String} key The key to check.
        * @param {Array} values The values that will match.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        containedIn: function(key, values) {
            this._addCondition(key, "$in", values);
            return this;
        },

        /**
        * Add a constraint to the query that requires a particular key's value to
        * not be contained in the provided list of values.
        * @param {String} key The key to check.
        * @param {Array} values The values that will not match.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        notContainedIn: function(key, values) {
            this._addCondition(key, "$nin", values);
            return this;
        },

        /**
        * Add a constraint to the query that requires a particular key's value to
        * contain each one of the provided list of values.
        * @param {String} key The key to check.  This key's value must be an array.
        * @param {Array} values The values that will match.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        containsAll: function(key, values) {
            this._addCondition(key, "$all", values);
            return this;
        },


        /**
        * Add a constraint for finding objects that contain the given key.
        * @param {String} key The key that should exist.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        exists: function(key) {
            this._addCondition(key, "$exists", true);
            return this;
        },

        /**
        * Add a constraint for finding objects that do not contain a given key.
        * @param {String} key The key that should not exist
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        doesNotExist: function(key) {
            this._addCondition(key, "$exists", false);
            return this;
        },

        /**
        * Add a regular expression constraint for finding string values that match
        * the provided regular expression.
        * This may be slow for large datasets.
        * @param {String} key The key that the string to match is stored in.
        * @param {RegExp} regex The regular expression pattern to match.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        matches: function(key, regex, modifiers) {
            this._addCondition(key, "$regex", regex);
            if (!modifiers) { modifiers = ""; }
            // Javascript regex options support mig as inline options but store them 
            // as properties of the object. We support mi & should migrate them to
            // modifiers
            if (regex.ignoreCase) { modifiers += 'i'; }
            if (regex.multiline) { modifiers += 'm'; }

            if (modifiers && modifiers.length) {
                this._addCondition(key, "$options", modifiers);
            }
            return this;
        },

        /**
        * Add a constraint that requires that a key's value matches a ParseQuery
        * constraint.
        * @param {String} key The key that the contains the object to match the
        *                     query.
        * @param {ParseQuery} query The query that should match.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        matchesQuery: function(key, query) {
            var queryJSON = query.toJSON();
            queryJSON.className = query.className;
            this._addCondition(key, "$inQuery", queryJSON);
            return this;
        },

        /**
        * Add a constraint that requires that a key's value not matches a
        * ParseQuery constraint.
        * @param {String} key The key that the contains the object to match the
        *                     query.
        * @param {ParseQuery} query The query that should not match.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        doesNotMatchQuery: function(key, query) {
            var queryJSON = query.toJSON();
            queryJSON.className = query.className;
            this._addCondition(key, "$notInQuery", queryJSON);
            return this;
        },


        /**
        * Add a constraint that requires that a key's value matches a value in
        * an object returned by a different ParseQuery.
        * @param {String} key The key that contains the value that is being
        *                     matched.
        * @param {String} queryKey The key in the objects returned by the query to
        *                          match against.
        * @param {ParseQuery} query The query to run.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        matchesKeyInQuery: function(key, queryKey, query) {
            var queryJSON = query.toJSON();
            queryJSON.className = query.className;
            this._addCondition(key, "$select",
            { key: queryKey, query: queryJSON });
            return this;
        },

        /**
        * Add a constraint that requires that a key's value not match a value in
        * an object returned by a different ParseQuery.
        * @param {String} key The key that contains the value that is being
        *                     excluded.
        * @param {String} queryKey The key in the objects returned by the query to
        *                          match against.
        * @param {ParseQuery} query The query to run.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        doesNotMatchKeyInQuery: function(key, queryKey, query) {
            var queryJSON = query.toJSON();
            queryJSON.className = query.className;
            this._addCondition(key, "$dontSelect",
            { key: queryKey, query: queryJSON });
            return this;
        },

        /**
        * Add constraint that at least one of the passed in queries matches.
        * @param {Array} queries
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        _orQuery: function(queries) {
            var queryJSON = _.map(queries, function(q) {
                return q.toJSON().where;
            });

            this._where.$or = queryJSON;
            return this;
        },

        /**
        * Converts a string into a regex that matches it.
        * Surrounding with \Q .. \E does this, we just need to escape \E's in
        * the text separately.
        */
        _quote: function(s) {
            return "\\Q" + s.replace("\\E", "\\E\\\\E\\Q") + "\\E";
        },

        /**
        * Add a constraint for finding string values that contain a provided
        * string.  This may be slow for large datasets.
        * @param {String} key The key that the string to match is stored in.
        * @param {String} substring The substring that the value must contain.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        contains: function(key, value) {
            this._addCondition(key, "$regex", this._quote(value));
            return this;
        },

        /**
        * Add a constraint for finding string values that start with a provided
        * string.  This query will use the backend index, so it will be fast even
        * for large datasets.
        * @param {String} key The key that the string to match is stored in.
        * @param {String} prefix The substring that the value must start with.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        startsWith: function(key, value) {
            this._addCondition(key, "$regex", "^" + this._quote(value));
            return this;
        },

        /**
        * Add a constraint for finding string values that end with a provided
        * string.  This will be slow for large datasets.
        * @param {String} key The key that the string to match is stored in.
        * @param {String} suffix The substring that the value must end with.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        endsWith: function(key, value) {
            this._addCondition(key, "$regex", this._quote(value) + "$");
        return this;
        },

        /**
        * Sorts the results in ascending order by the given key.
        * 
        * @param {(String|String[]|...String} key The key to order by, which is a 
        * string of comma separated values, or an Array of keys, or multiple keys.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        ascending: function() {
            this._order = [];
            return this.addAscending.apply(this, arguments);
        },

        /**
        * Sorts the results in ascending order by the given key, 
        * but can also add secondary sort descriptors without overwriting _order.
        * 
        * @param {(String|String[]|...String} key The key to order by, which is a
        * string of comma separated values, or an Array of keys, or multiple keys.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        addAscending: function(key) {
            var self = this; 
            if (!this._order) {
                this._order = [];
            }
            ParseCore._arrayEach(arguments, function(key) {
                if (Array.isArray(key)) {
                    key = key.join();
                }
                self._order = self._order.concat(key.replace(/\s/g, "").split(","));
            });
            return this;
        },

        /**
        * Sorts the results in descending order by the given key.
        * 
        * @param {(String|String[]|...String} key The key to order by, which is a
        * string of comma separated values, or an Array of keys, or multiple keys.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        descending: function(key) {
            this._order = [];
            return this.addDescending.apply(this, arguments);
        },

        /**
        * Sorts the results in descending order by the given key,
        * but can also add secondary sort descriptors without overwriting _order.
        * 
        * @param {(String|String[]|...String} key The key to order by, which is a
        * string of comma separated values, or an Array of keys, or multiple keys.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        addDescending: function(key) {
            var self = this; 
            if (!this._order) {
                this._order = [];
            }
            ParseCore._arrayEach(arguments, function(key) {
                if (Array.isArray(key)) {
                key = key.join();
                }
                self._order = self._order.concat(
                _.map(key.replace(/\s/g, "").split(","), 
                function(k) { return "-" + k; }));
            });
            return this;
        },

        /**
        * Add a proximity based constraint for finding objects with key point
        * values near the point given.
        * @param {String} key The key that the ParseGeoPoint is stored in.
        * @param {ParseGeoPoint} point The reference ParseGeoPoint that is used.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        near: function(key, point) {
            if (!(point instanceof ParseGeoPoint)) {
            // Try to cast it to a GeoPoint, so that near("loc", [20,30]) works.
            point = new ParseGeoPoint(point);
            }
            this._addCondition(key, "$nearSphere", point);
            return this;
        },

        /**
        * Add a proximity based constraint for finding objects with key point
        * values near the point given and within the maximum distance given.
        * @param {String} key The key that the ParseGeoPoint is stored in.
        * @param {ParseGeoPoint} point The reference ParseGeoPoint that is used.
        * @param {Number} maxDistance Maximum distance (in radians) of results to
        *   return.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        withinRadians: function(key, point, distance) {
            this.near(key, point);
            this._addCondition(key, "$maxDistance", distance);
            return this;
        },

        /**
        * Add a proximity based constraint for finding objects with key point
        * values near the point given and within the maximum distance given.
        * Radius of earth used is 3958.8 miles.
        * @param {String} key The key that the ParseGeoPoint is stored in.
        * @param {ParseGeoPoint} point The reference ParseGeoPoint that is used.
        * @param {Number} maxDistance Maximum distance (in miles) of results to
        *     return.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        withinMiles: function(key, point, distance) {
            return this.withinRadians(key, point, distance / 3958.8);
        },

        /**
        * Add a proximity based constraint for finding objects with key point
        * values near the point given and within the maximum distance given.
        * Radius of earth used is 6371.0 kilometers.
        * @param {String} key The key that the ParseGeoPoint is stored in.
        * @param {ParseGeoPoint} point The reference ParseGeoPoint that is used.
        * @param {Number} maxDistance Maximum distance (in kilometers) of results
        *     to return.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        withinKilometers: function(key, point, distance) {
            return this.withinRadians(key, point, distance / 6371.0);
        },

        /**
        * Add a constraint to the query that requires a particular key's
        * coordinates be contained within a given rectangular geographic bounding
        * box.
        * @param {String} key The key to be constrained.
        * @param {ParseGeoPoint} southwest
        *     The lower-left inclusive corner of the box.
        * @param {ParseGeoPoint} northeast
        *     The upper-right inclusive corner of the box.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        withinGeoBox: function(key, southwest, northeast) {
            if (!(southwest instanceof ParseGeoPoint)) {
                southwest = new ParseGeoPoint(southwest);
            }
            if (!(northeast instanceof ParseGeoPoint)) {
                northeast = new ParseGeoPoint(northeast);
            }
            this._addCondition(key, '$within', { '$box': [southwest, northeast] });
            return this;
        },

        /**
        * Include nested ParseObjects for the provided key.  You can use dot
        * notation to specify which fields in the included object are also fetch.
        * @param {String} key The name of the key to include.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        include: function() {
            var self = this;
            ParseCore._arrayEach(arguments, function(key) {
                if (_.isArray(key)) {
                    self._include = self._include.concat(key);
                } else {
                    self._include.push(key);
                }
            });
            return this;
        },

        /**
        * Restrict the fields of the returned ParseObjects to include only the
        * provided keys.  If this is called multiple times, then all of the keys
        * specified in each of the calls will be included.
        * @param {Array} keys The names of the keys to include.
        * @return {ParseQuery} Returns the query, so you can chain this call.
        */
        select: function() {
            var self = this;
            this._select = this._select || [];
            ParseCore._arrayEach(arguments, function(key) {
                if (_.isArray(key)) {
                    self._select = self._select.concat(key);
                } else {
                    self._select.push(key);
                }
            });
            return this;
        },

        /**
        * Iterates over each result of a query, calling a callback for each one. If
        * the callback returns a promise, the iteration will not continue until
        * that promise has been fulfilled. If the callback returns a rejected
        * promise, then iteration will stop with that error. The items are
        * processed in an unspecified order. The query may not have any sort order,
        * and may not use limit or skip.
        * @param {Function} callback Callback that will be called with each result
        *     of the query.
        * @param {Object} options An optional Backbone-like options object with
        *     success and error callbacks that will be invoked once the iteration
        *     has finished.
        * @return {Parse.Promise} A promise that will be fulfilled once the
        *     iteration has completed.
        */
        each: function(callback, options) {
            options = options || {};

            if (this._order || this._skip || (this._limit >= 0)) {
            var error =
                "Cannot iterate on a query with sort, skip, or limit.";
                return $q.reject(error)
                // ._thenRunCallbacks(options);
            }

            var defer = $q.defer(),
            promise = defer.promise;

            var query = new ParseQuery(this.objectClass);
            // We can override the batch size from the options.
            // This is undocumented, but useful for testing.
            query._limit = options.batchSize || 100;
            query._where = _.clone(this._where);
            query._include = _.clone(this._include);

            query.ascending('objectId');

            var findOptions = {};
            if (_.has(options, "useMasterKey")) {
                findOptions.useMasterKey = options.useMasterKey;
            }

            var finished = false;
            return ParseCore._continueWhile(function() {
                return !finished;
            }, function() {
                return query.find(findOptions).then(function(results) {
                    var defer = $q.defer();
                    defer.resolve();
                    var callbacksDone = defer.promise;

                    _.each(results, function(result) {
                        callbacksDone = callbacksDone.then(function() {
                            return callback(result);
                        });
                    });

                    return callbacksDone.then(function() {
                        if (results.length >= query._limit) {
                            query.greaterThan("objectId", results[results.length - 1].id);
                        } else {
                            finished = true;
                        }
                    });
                });
            })
            // ._thenRunCallbacks(options);
        }
    };


    return ParseQuery;
});