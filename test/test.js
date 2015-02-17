var app = angular.module('app', [
    'Parse'
]);

app.run(function(ParseSDK){


    ParseSDK.initialize('BASVF7j1qlgnpgIhSAm6xs3oE6hDLc1SKsYGijw5', 'uXH3hwH6LQI3gQoRvBhWYU23EZRD1zNxIsrHaFYD');

    var obj = new ParseSDK.Object("Monster");
    obj.set('test', 'here');
    obj.set('time', new Date());
    obj.save()
    .then(function(o){
        

        var q = new ParseSDK.Query('Monster');
        q.limit(10);
        q.descending('createdAt');
        q.find()
        .then(function(results){
            console.log(results);
        })

    });

});