var module = angular.module("ParseAngular.Relation", [
    'ParseAngular.Query',
    'ParseAngular.Object',
    'ParseAngular.Op'
]);

module.factory('ParseRelation', function(ParseQuery, ParseObject, ParseOp){

    var ParseRelation;
    /**
    * Creates a new Relation for the given parent object and key. This
    * constructor should rarely be used directly, but rather created by
    * ParseObject.relation.
    * @param {ParseObject} parent The parent of this relation.
    * @param {String} key The key for this relation on the parent.
    * @see ParseObject#relation
    * @class
    *
    * <p>
    * A class that is used to access all of the children of a many-to-many
    * relationship.  Each instance of ParseRelation is associated with a
    * particular parent object and key.
    * </p>
    */
    ParseRelation = function(parent, key) {
        this.parent = parent;
        this.key = key;
        this.targetClassName = null;
    };

    ParseRelation.prototype = {
        /**
        * Makes sure that this relation has the right parent and key.
        */
        _ensureParentAndKey: function(parent, key) {
            this.parent = this.parent || parent;
            this.key = this.key || key;
            if (this.parent !== parent) {
                throw "Internal Error. Relation retrieved from two different Objects.";
            }
            if (this.key !== key) {
                throw "Internal Error. Relation retrieved from two different keys.";
            }
        },

        /**
        * Adds a ParseObject or an array of ParseObjects to the relation.
        * @param {} objects The item or items to add.
        */
        add: function(objects) {
            if (!_.isArray(objects)) {
                objects = [objects];
            }

            var change = new ParseOp.Relation(objects, []);
            this.parent.set(this.key, change);
            this.targetClassName = change._targetClassName;
        },

        /**
        * Removes a ParseObject or an array of ParseObjects from this relation.
        * @param {} objects The item or items to remove.
        */
        remove: function(objects) {
            if (!_.isArray(objects)) {
                objects = [objects];
            }

            var change = new ParseOp.Relation([], objects);
            this.parent.set(this.key, change);
            this.targetClassName = change._targetClassName;
        },

        /**
        * Returns a JSON version of the object suitable for saving to disk.
        * @return {Object}
        */
        toJSON: function() {
            return { "__type": "Relation", "className": this.targetClassName };
        },

        /**
        * Returns a ParseQuery that is limited to objects in this
        * relation.
        * @return {ParseQuery}
        */
        query: function() {
            var targetClass;
            var query;
            if (!this.targetClassName) {
                targetClass = ParseObject._getSubclass(this.parent.className);
                query = new ParseQuery(targetClass);
                query._extraOptions.redirectClassNameForKey = this.key;
            } else {
                targetClass = ParseObject._getSubclass(this.targetClassName);
                query = new ParseQuery(targetClass);
            }
            query._addCondition("$relatedTo", "object", this.parent._toPointer());
            query._addCondition("$relatedTo", "key", this.key);

            return query;
        }
    };

    return ParseRelation;

});