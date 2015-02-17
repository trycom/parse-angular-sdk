var module = angular.module('ParseAngular.Role', [
    'ParseAngular.Object',
    'ParseAngular.Error',
    'ParseAngular.ACL'
]);

module.factory('ParseRole', function(ParseObject, ParseError, $injector){

    /**
    * Represents a Role on the Parse server. Roles represent groupings of
    * Users for the purposes of granting permissions (e.g. specifying an ACL
    * for an Object). Roles are specified by their sets of child users and
    * child roles, all of which are granted any permissions that the parent
    * role has.
    *
    * <p>Roles must have a name (which cannot be changed after creation of the
    * role), and must specify an ACL.</p>
    * @class
    * A ParseRole is a local representation of a role persisted to the Parse
    * cloud.
    */
    ParseRole = ParseObject.extend("_Role", /** @lends ParseRole.prototype */ {
        // Instance Methods

        /**
        * Constructs a new ParseRole with the given name and ACL.
        * 
        * @param {String} name The name of the Role to create.
        * @param {Parse.ACL} acl The ACL for this role. Roles must have an ACL.
        */
        constructor: function(name, acl) {
            var ParseACL = $injector.get('ParseACL');
            if (_.isString(name) && (acl instanceof ParseACL)) {
                ParseObject.prototype.constructor.call(this, null, null);
                this.setName(name);
                this.setACL(acl);
            } else {
                ParseObject.prototype.constructor.call(this, name, acl);
            }
        },

        /**
        * Gets the name of the role.  You can alternatively call role.get("name")
        * 
        * @return {String} the name of the role.
        */
        getName: function() {
            return this.get("name");
        },

        /**
        * Sets the name for a role. This value must be set before the role has
        * been saved to the server, and cannot be set once the role has been
        * saved.
        * 
        * <p>
        *   A role's name can only contain alphanumeric characters, _, -, and
        *   spaces.
        * </p>
        *
        * <p>This is equivalent to calling role.set("name", name)</p>
        * 
        * @param {String} name The name of the role.
        * @param {Object} options Standard options object with success and error
        *     callbacks.
        */
        setName: function(name, options) {
            return this.set("name", name, options);
        },

        /**
        * Gets the Parse.Relation for the Parse.Users that are direct
        * children of this role. These users are granted any privileges that this
        * role has been granted (e.g. read or write access through ACLs). You can
        * add or remove users from the role through this relation.
        * 
        * <p>This is equivalent to calling role.relation("users")</p>
        * 
        * @return {Parse.Relation} the relation for the users belonging to this
        *     role.
        */
        getUsers: function() {
            return this.relation("users");
        },

        /**
        * Gets the Parse.Relation for the ParseRoles that are direct
        * children of this role. These roles' users are granted any privileges that
        * this role has been granted (e.g. read or write access through ACLs). You
        * can add or remove child roles from this role through this relation.
        * 
        * <p>This is equivalent to calling role.relation("roles")</p>
        * 
        * @return {Parse.Relation} the relation for the roles belonging to this
        *     role.
        */
        getRoles: function() {
            return this.relation("roles");
        },

        /**
        * @ignore
        */
        validate: function(attrs, options) {
            if ("name" in attrs && attrs.name !== this.getName()) {
                var newName = attrs.name;
                    if (this.id && this.id !== attrs.objectId) {
                    // Check to see if the objectId being set matches this.id.
                    // This happens during a fetch -- the id is set before calling fetch.
                    // Let the name be set in this case.
                    return new ParseError(ParseError.OTHER_CAUSE,
                    "A role's name can only be set before it has been saved.");
                }
                if (!_.isString(newName)) {
                    return new ParseError(ParseError.OTHER_CAUSE,
                    "A role's name must be a String.");
                }
                if (!(/^[0-9a-zA-Z\-_ ]+$/).test(newName)) {
                    return new ParseError(ParseError.OTHER_CAUSE,
                    "A role's name can only contain alphanumeric characters, _," +
                    " -, and spaces.");
                }
            }
            if (ParseObject.prototype.validate) {
                return ParseObject.prototype.validate.call(this, attrs, options);
            }
            return false;
        }
    });

    return ParseRole;
});