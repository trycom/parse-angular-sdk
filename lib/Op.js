var module = angular.module("ParseAngular.Op", [
    'ParseAngular.Core'
]);

module.factory('ParseOp', function(ParseCore, $injector){

    var ParseOp;
    /**
    * @class
    * A ParseOp is an atomic operation that can be applied to a field in a
    * ParseObject. For example, calling <code>object.set("foo", "bar")</code>
    * is an example of a ParseOp.Set. Calling <code>object.unset("foo")</code>
    * is a ParseOp.Unset. These operations are stored in a ParseObject and
    * sent to the server as part of <code>object.save()</code> operations.
    * Instances of ParseOp should be immutable.
    *
    * You should not create subclasses of ParseOp or instantiate ParseOp
    * directly.
    */

    var isInstanceOfParseObject = function(o) {
        var ParseObject = $injector.get('ParseObject');
        return o instanceof ParseObject;
    };


    ParseOp = function() {
        this._initialize.apply(this, arguments);
    };

    ParseOp.prototype = {
        _initialize: function() {}
    };

    _.extend(ParseOp, {
        /**
        * To create a new Op, call ParseOp._extend();
        */
        _extend: ParseCore._extend,

        // A map of __op string to decoder function.
        _opDecoderMap: {},

        /**
        * Registers a function to convert a json object with an __op field into an
        * instance of a subclass of ParseOp.
        */
        _registerDecoder: function(opName, decoder) {
            ParseOp._opDecoderMap[opName] = decoder;
        },

        /**
        * Converts a json object into an instance of a subclass of ParseOp.
        */
        _decode: function(json) {
            var decoder = ParseOp._opDecoderMap[json.__op];
            if (decoder) {
                return decoder(json);
            } else {
                return undefined;
            }
        }
    });

    /*
    * Add a handler for Batch ops.
    */
    ParseOp._registerDecoder("Batch", function(json) {
        var op = null;
        ParseCore._arrayEach(json.ops, function(nextOp) {
            nextOp = ParseOp._decode(nextOp);
            op = nextOp._mergeWithPrevious(op);
        });
        return op;
    });

    /**
    * @class
    * A Set operation indicates that either the field was changed using
    * ParseObject.set, or it is a mutable container that was detected as being
    * changed.
    */
    ParseOp.Set = ParseOp._extend(/** @lends ParseOp.Set.prototype */ {
        _initialize: function(value) {
            this._value = value;
        },

        /**
        * Returns the new value of this field after the set.
        */
        value: function() {
            return this._value;
        },

        /**
        * Returns a JSON version of the operation suitable for sending to Parse.
        * @return {Object}
        */
        toJSON: function() {
            return ParseCore._encode(this.value());
        },

        _mergeWithPrevious: function(previous) {
            return this;
        },

        _estimate: function(oldValue) {
            return this.value();
        }
    });

    /**
    * A sentinel value that is returned by ParseOp.Unset._estimate to
    * indicate the field should be deleted. Basically, if you find _UNSET as a
    * value in your object, you should remove that key.
    */
    ParseOp._UNSET = {};

    /**
    * @class
    * An Unset operation indicates that this field has been deleted from the
    * object.
    */
    ParseOp.Unset = ParseOp._extend(/** @lends ParseOp.Unset.prototype */ {
        /**
        * Returns a JSON version of the operation suitable for sending to Parse.
        * @return {Object}
        */
        toJSON: function() {
            return { __op: "Delete" };
        },

        _mergeWithPrevious: function(previous) {
            return this;
        },

        _estimate: function(oldValue) {
            return ParseOp._UNSET;
        }
    });

    ParseOp._registerDecoder("Delete", function(json) {
        return new ParseOp.Unset();
    });

    /**
    * @class
    * An Increment is an atomic operation where the numeric value for the field
    * will be increased by a given amount.
    */
    ParseOp.Increment = ParseOp._extend(
    /** @lends ParseOp.Increment.prototype */ {

        _initialize: function(amount) {
            this._amount = amount;
        },

        /**
        * Returns the amount to increment by.
        * @return {Number} the amount to increment by.
        */
        amount: function() {
            return this._amount;
        },

        /**
        * Returns a JSON version of the operation suitable for sending to Parse.
        * @return {Object}
        */
        toJSON: function() {
            return { __op: "Increment", amount: this._amount };
        },

        _mergeWithPrevious: function(previous) {
            if (!previous) {
                return this;
            } else if (previous instanceof ParseOp.Unset) {
                return new ParseOp.Set(this.amount());
            } else if (previous instanceof ParseOp.Set) {
                return new ParseOp.Set(previous.value() + this.amount());
            } else if (previous instanceof ParseOp.Increment) {
                return new ParseOp.Increment(this.amount() + previous.amount());
            } else {
                throw "Op is invalid after previous op.";
            }
        },

        _estimate: function(oldValue) {
            if (!oldValue) {
                return this.amount();
            }
            return oldValue + this.amount();
        }
    });

    ParseOp._registerDecoder("Increment", function(json) {
        return new ParseOp.Increment(json.amount);
    });

    /**
    * @class
    * Add is an atomic operation where the given objects will be appended to the
    * array that is stored in this field.
    */
    ParseOp.Add = ParseOp._extend(/** @lends ParseOp.Add.prototype */ {
        _initialize: function(objects) {
            this._objects = objects;
        },

        /**
        * Returns the objects to be added to the array.
        * @return {Array} The objects to be added to the array.
        */
        objects: function() {
            return this._objects;
        },

        /**
        * Returns a JSON version of the operation suitable for sending to Parse.
        * @return {Object}
        */
        toJSON: function() {
            return { __op: "Add", objects: ParseCore._encode(this.objects()) };
        },

        _mergeWithPrevious: function(previous) {
            if (!previous) {
                return this;
            } else if (previous instanceof ParseOp.Unset) {
                return new ParseOp.Set(this.objects());
            } else if (previous instanceof ParseOp.Set) {
                return new ParseOp.Set(this._estimate(previous.value()));
            } else if (previous instanceof ParseOp.Add) {
                return new ParseOp.Add(previous.objects().concat(this.objects()));
            } else {
                throw "Op is invalid after previous op.";
            }
        },

        _estimate: function(oldValue) {
            if (!oldValue) {
                return _.clone(this.objects());
            } else {
                return oldValue.concat(this.objects());
            }
        }
    });

    ParseOp._registerDecoder("Add", function(json) {
        return new ParseOp.Add(ParseCore._decode(undefined, json.objects));
    });

    /**
    * @class
    * AddUnique is an atomic operation where the given items will be appended to
    * the array that is stored in this field only if they were not already
    * present in the array.
    */
    ParseOp.AddUnique = ParseOp._extend(
        /** @lends ParseOp.AddUnique.prototype */ {

        _initialize: function(objects) {
            this._objects = _.uniq(objects);
        },

        /**
        * Returns the objects to be added to the array.
        * @return {Array} The objects to be added to the array.
        */
        objects: function() {
            return this._objects;
        },

        /**
        * Returns a JSON version of the operation suitable for sending to Parse.
        * @return {Object}
        */
        toJSON: function() {
            return { __op: "AddUnique", objects: ParseCore._encode(this.objects()) };
        },

        _mergeWithPrevious: function(previous) {
            if (!previous) {
                return this;
            } else if (previous instanceof ParseOp.Unset) {
                return new ParseOp.Set(this.objects());
            } else if (previous instanceof ParseOp.Set) {
                return new ParseOp.Set(this._estimate(previous.value()));
            } else if (previous instanceof ParseOp.AddUnique) {
                return new ParseOp.AddUnique(this._estimate(previous.objects()));
            } else {
                throw "Op is invalid after previous op.";
            }
        },

        _estimate: function(oldValue) {
            if (!oldValue) {
                return _.clone(this.objects());
            } else {
                // We can't just take the _.uniq(_.union(...)) of oldValue and
                // this.objects, because the uniqueness may not apply to oldValue
                // (especially if the oldValue was set via .set())
                var newValue = _.clone(oldValue);
                ParseCore._arrayEach(this.objects(), function(obj) {
                    if (isInstanceOfParseObject(obj) && obj.id) {
                        var matchingObj = _.find(newValue, function(anObj) {
                            return (isInstanceOfParseObject(anObj)) && (anObj.id === obj.id);
                        });
                        if (!matchingObj) { 
                            newValue.push(obj);
                        } else {
                            var index = _.indexOf(newValue, matchingObj);
                            newValue[index] = obj;
                        }
                    } else if (!_.contains(newValue, obj)) {
                        newValue.push(obj);
                    }
                });
                return newValue;
            }
        }
    });

    ParseOp._registerDecoder("AddUnique", function(json) {
        return new ParseOp.AddUnique(ParseCore._decode(undefined, json.objects));
    });

    /**
    * @class
    * Remove is an atomic operation where the given objects will be removed from
    * the array that is stored in this field.
    */
    ParseOp.Remove = ParseOp._extend(/** @lends ParseOp.Remove.prototype */ {
        _initialize: function(objects) {
            this._objects = _.uniq(objects);
        },

        /**
        * Returns the objects to be removed from the array.
        * @return {Array} The objects to be removed from the array.
        */
        objects: function() {
            return this._objects;
        },

        /**
        * Returns a JSON version of the operation suitable for sending to Parse.
        * @return {Object}
        */
        toJSON: function() {
            return { __op: "Remove", objects: ParseCore._encode(this.objects()) };
        },

        _mergeWithPrevious: function(previous) {
            if (!previous) {
                return this;
            } else if (previous instanceof ParseOp.Unset) {
                return previous;
            } else if (previous instanceof ParseOp.Set) {
                return new ParseOp.Set(this._estimate(previous.value()));
            } else if (previous instanceof ParseOp.Remove) {
                return new ParseOp.Remove(_.union(previous.objects(), this.objects()));
            } else {
                throw "Op is invalid after previous op.";
            }
        },

        _estimate: function(oldValue) {
            if (!oldValue) {
                return [];
            } else {
                var newValue = _.difference(oldValue, this.objects());
                // If there are saved Parse Objects being removed, also remove them.
                ParseCore._arrayEach(this.objects(), function(obj) {
                    if (isInstanceOfParseObject(obj) && obj.id) {
                        newValue = _.reject(newValue, function(other) {
                            return (isInstanceOfParseObject(other)) && (other.id === obj.id);
                       });
                    }
                });
                return newValue;
            }
        }
    });

    ParseOp._registerDecoder("Remove", function(json) {
        return new ParseOp.Remove(ParseCore._decode(undefined, json.objects));
    });

    /**
    * @class
    * A Relation operation indicates that the field is an instance of
    * $injector.get('ParseRelation'), and objects are being added to, or removed from, that
    * relation.
    */
    ParseOp.Relation = ParseOp._extend(
        /** @lends ParseOp.Relation.prototype */ {

        _initialize: function(adds, removes) {
            this._targetClassName = null;

            var self = this;

            var pointerToId = function(object) {
                if (isInstanceOfParseObject(object)) {
                    if (!object.id) {
                        throw "You can't add an unsaved ParseObject to a relation.";
                    }
                    if (!self._targetClassName) {
                        self._targetClassName = object.className;
                    }
                    if (self._targetClassName !== object.className) {
                        throw "Tried to create a $injector.get('ParseRelation') with 2 different types: " +
                        self._targetClassName + " and " + object.className + ".";
                    }
                        return object.id;
                }
                return object;
            };

            this.relationsToAdd = _.uniq(_.map(adds, pointerToId));
            this.relationsToRemove = _.uniq(_.map(removes, pointerToId));
        },

        /**
        * Returns an array of unfetched ParseObject that are being added to the
        * relation.
        * @return {Array}
        */
        added: function() {
            var self = this;
            var ParseObject = $injector.get('ParseObject');
            return _.map(this.relationsToAdd, function(objectId) {
                var object = ParseObject._create(self._targetClassName);
                object.id = objectId;
                return object;
            });
        },

        /**
        * Returns an array of unfetched ParseObject that are being removed from
        * the relation.
        * @return {Array}
        */
        removed: function() {
            var self = this;
            var ParseObject = $injector.get('ParseObject');

            return _.map(this.relationsToRemove, function(objectId) {
                var object = ParseObject._create(self._targetClassName);
                object.id = objectId;
                return object;
            });
        },

        /**
        * Returns a JSON version of the operation suitable for sending to Parse.
        * @return {Object}
        */
        toJSON: function() {
            var adds = null;
            var removes = null;
            var self = this;
            var idToPointer = function(id) {
                return { __type: 'Pointer',
                className: self._targetClassName,
                objectId: id };
            };
            var pointers = null;
            if (this.relationsToAdd.length > 0) {
                pointers = _.map(this.relationsToAdd, idToPointer);
                adds = { "__op": "AddRelation", "objects": pointers };
            }

            if (this.relationsToRemove.length > 0) {
                pointers = _.map(this.relationsToRemove, idToPointer);
                removes = { "__op": "RemoveRelation", "objects": pointers };
            }

            if (adds && removes) {
                return { "__op": "Batch", "ops": [adds, removes]};
            }

            return adds || removes || {};
        },

        _mergeWithPrevious: function(previous) {
            if (!previous) {
                return this;
            } else if (previous instanceof ParseOp.Unset) {
                throw "You can't modify a relation after deleting it.";
            } else if (previous instanceof ParseOp.Relation) {
                if (previous._targetClassName &&
                    previous._targetClassName !== this._targetClassName) {
                        throw "Related object must be of class " + previous._targetClassName +
                        ", but " + this._targetClassName + " was passed in.";
                }
                var newAdd = _.union(_.difference(previous.relationsToAdd,
                    this.relationsToRemove),
                    this.relationsToAdd);
                var newRemove = _.union(_.difference(previous.relationsToRemove,
                    this.relationsToAdd),
                    this.relationsToRemove);

                var newRelation = new ParseOp.Relation(newAdd, newRemove);
                newRelation._targetClassName = this._targetClassName;
                return newRelation;
            } else {
                throw "Op is invalid after previous op.";
            }
        },

        _estimate: function(oldValue, object, key) {
            var ParseRelation = $injector.get('ParseRelation');
            if (!oldValue) {
                var relation = new (ParseRelation)(object, key);
                relation.targetClassName = this._targetClassName;
            } else if (oldValue instanceof ParseRelation) {
                if (this._targetClassName) {
                    if (oldValue.targetClassName) {
                        if (oldValue.targetClassName !== this._targetClassName) {
                            throw "Related object must be a " + oldValue.targetClassName +
                            ", but a " + this._targetClassName + " was passed in.";
                        }
                    } else {
                        oldValue.targetClassName = this._targetClassName;
                    }
                }
                return oldValue;
            } else {
                throw "Op is invalid after previous op.";
            }
        }
    });

    ParseOp._registerDecoder("AddRelation", function(json) {
        return new ParseOp.Relation(ParseCore._decode(undefined, json.objects), []);
    });
    ParseOp._registerDecoder("RemoveRelation", function(json) {
        return new ParseOp.Relation([], ParseCore._decode(undefined, json.objects));
    });

    return ParseOp;

});

