var module = angular.module('Parse', [
    'ParseAngular.ACL',
    'ParseAngular.Cloud',
    'ParseAngular.Config',
    'ParseAngular.Core',
    // 'ParseAngular.Error',
    // 'ParseAngular.Events',
    'ParseAngular.FacebookUtils',
    'ParseAngular.GeoPoint',
    'ParseAngular.Object',
    // 'ParseAngular.Op',
    'ParseAngular.Query',
    'ParseAngular.Relation',
    'ParseAngular.User'
]);


module.factory('ParseSDK', function(
    ParseACL,
    ParseCloud,
    ParseConfig,
    ParseCore,
    ParseFacebookUtils,
    ParseGeoPoint,
    ParseObject,
    ParseQuery,
    ParseRelation,
    ParseUser
){

    var ParseSDK = ParseCore;

    var toExtend = {
        ACL: ParseACL,
        Cloud: ParseCloud,
        Config: ParseConfig,
        FacebookUtils: ParseFacebookUtils,
        GeoPoint: ParseGeoPoint,
        Object: ParseObject,
        Query: ParseQuery,
        Relation: ParseRelation,
        User: ParseUser
    };

    // Augment the Core with extra modules
    _.extend(ParseSDK, toExtend);

    return ParseSDK;

});