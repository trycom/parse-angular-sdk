# parse-angular-sdk

This is an unofficial port of the Parse JavaScript SDK to a native Angular SDK. 

Disclaimer:  we are not affiliated in any ways with Parse and we this is offered as is; we don't take responsibility for any bugs you might encouter in production. However you are encouraged to help us maintain this SDK, as the Parse SDK evolves.

This version of SDK does **not** contain the following Parse. modules:

- Promise (turned useless by $q)
- View
- Router
- History
- File

It also drops support for callback hashes. All methods are promises only. You need to have underscore/lodash included in your app too.

Feel free to include them in your app using the method we used; which is isolating every module inside an Angular component, and replacing http requests using $http, promises using $q.