# kdg19
Karlsruhe Data Game at "Seasons of Media Art" 2019

# Installation
## PHP
Backend-code is in index.php

Run "composer update" to install the required PHP modules. We need PHP7

## Ini file
We use a file kdg.ini which keeps all sensitive information. Put it into a suitable directory,
preferable outside the reach of the web server.
This is the template:

```
[mail]
from = "xyz@123.45"
smtphost = "your host"
smtpport = 587
smtpuser = "your user"
smtppass = "your pwd"


[db]
dbname = database
dbserv = most probably localhost
dbuser = user
dbpass = password


[confirms]
#day based encoding
confseed = "any value like: thisIsMySeed12345678"

```

kdg.ini is loaded by index.php, so adjust the path there. For developmen, you can keep it in the same directory.

## htaccess
Adjust the .htaccess file to your webserver configuration

## Database
initialise the database from the template like. Make sure you have the proper access rights.
Update name, user and password according to your host installation.

```
mysql -p < kdg_structure.sql 
```

## External Javascript libraries
Frontend-code is in custom.js

Please put the following libraries into the js and possibly css directories or update kdg.html to use the external versions

 * [w3.js](https://www.w3schools.com/w3js/)
 * [leaflet](https://leafletjs.com/)
 * [d3](https://d3js.org/)
 * [cs](https://c3js.org/)
 * [crypto-js](https://github.com/brix/crypto-js)
 * [jsQR](https://github.com/cozmo/jsQR)

All custom code is in custom.js and custom.css


