module.exports = function(grunt) {

    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');


    grunt.initConfig({
        concat: {
            options: {
                separator: '\n'
            },
            dist: {
                src: [
                    // 'lib/**.js'
                    'lib/Error.js',
                    'lib/Core.js',
                    'lib/Cloud.js',
                    'lib/Config.js',
                    'lib/Events.js',
                    'lib/Op.js',
                    'lib/Object.js',
                    'lib/Relation.js',
                    'lib/GeoPoint.js',
                    'lib/Query.js',
                    'lib/User.js',
                    'lib/Role.js',
                    'lib/ACL.js',
                    'lib/FacebookUtils.js',
                    'lib/_ParseAngular.js',

                ],
                dest: 'dist/parse-angular-sdk.js'
            }
        }
    });


};