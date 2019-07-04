<?php

  // pull flight and medoo via composer autoload

  require 'vendor/autoload.php';

  // --------------------------------------------------
  // logging
  // --------------------------------------------------

  //relevant logLevels:"DEBUG", "NOTICE", "WARNING", "ERROR", "URGENT");

  $log_file = './kdg.log';
  Analog::handler(
      Analog\Handler\Threshold::init(
          Analog\Handler\File::init($log_file),
          Analog::WARNING  // this and all below will be logged
      // set to WARNING in production environment
      // or to DEBUG in development environment
      )
  );

  Analog::log("Log initialized on " . $_SERVER['HTTP_HOST'], Analog::NOTICE);


  // --------------------------------------------------
  // config setup
  // --------------------------------------------------
  // ini file on uberspace is elsewhere
  $cfg = array();
  //$cfg = parse_ini_file("/home/akugel/files/kdg/kdg.ini",false);
  // $cfg = parse_ini_file("kdg.ini",false);
  try {
      if (!isset($_SERVER['HTTP_HOST']) or ($_SERVER['HTTP_HOST'] == "kdg")) {
          $cfg = parse_ini_file("kdg.ini", false);
      } else {
          $cfg = parse_ini_file("/home/akugel/files/kdg/kdg.ini", false);
      }

      // don't print in real program
      //echo "Config items: " . count($cfg) . "\n";
      //print_r($cfg);
      Analog::log("Config parsed", Analog::NOTICE);
  } catch (Exception $e) {
      Analog::log("Config error", Analog::URGENT);
      exit("Error");
  }


  // --------------------------------------------------
  // database setup
  // --------------------------------------------------

  // Using Medoo namespace
  use Medoo\Medoo;

  // Initialize
  $database = null;

  try {
      $database = new Medoo([
          'database_type' => 'mysql',
          'database_name' => $cfg["dbname"],
          'server' =>  $cfg["dbserv"],
          'username' => $cfg["dbuser"],
          'password' => $cfg["dbpass"]
      ]);

      // don't print in real program
      //print_r($database->info());
      Analog::log("Database opened", Analog::NOTICE);
  } catch (Exception $e) {
      Analog::log("Database error", Analog::URGENT);
      exit("Error");
  }

  // --------------------------------------------------
  // router  setup
  // --------------------------------------------------
  // Routing in Flight is done by matching a URL pattern with a callback function.

  // --------------------------------------------------
  // helpers
  // --------------------------------------------------
  function sendSmtp($to, $body)
  {
      global $cfg;
      // set time zone for date usage later on
      date_default_timezone_set("Europe/Berlin");

      $host = $cfg["smtphost"];
      $port = $cfg["smtpport"];
      $from = $cfg["from"];
      $subj = "Anmeldung zum Datenspiel";
      $date = date(DATE_RFC2822);

      // test only
      //$to = "ak@akugel.de";


      try {
          $socket_options = array('ssl' => array('verify_peer_name' => true));
          /* Create a new Net_SMTP object. */
          if (! ($smtp = new Net_SMTP($host, $port, null, false, 0, $socket_options))) {
              throw new Exception("Unable to instantiate Net_SMTP object\n");
          }

          // Debug-Modus einschalten
          $smtp->setDebug(false);

          /* Connect to the SMTP server. */
          if (PEAR::isError($e = $smtp->connect())) {
              throw new Exception($e->getMessage() . "\n");
          }

          // authenticate
          if (PEAR::isError($smtp->auth($cfg["smtpuser"], $cfg["smtppass"]))) {
              throw new Exception("Unable to authenticate\n");
          }

          /* Send the 'MAIL FROM:' SMTP command. */
          if (PEAR::isError($smtp->mailFrom($from))) {
              throw new Exception("Unable to set sender to <$from>\n");
          }
          /* Address the message to each of the recipients. */
          if (PEAR::isError($res = $smtp->rcptTo($to))) {
              throw new Exception("Unable to add recipient <$to>: " . $res->getMessage() . "\n");
          }

          // set headers
          // options: "Content-Transfer-Encoding: 8bit \r\n";
          // "MIME-Version: 1.0 \r\n";
          $header = "From: KDG <".$from.">\r\nTo: ".$to;
          $header .= "\r\nSubject: ".$subj."\r\nDate: ".$date;
          $header .= "\r\nMIME-Version: 1.0";
          $header .= "\r\nContent-Encoding: 8bit"; // don't use quoted printable here ....
          $header .= "\r\nContent-Type: text/plain; charset=utf-8";
          $header .= "\r\n"; // terminating header
          /* Send the message. */
          //if (PEAR::isError($smtp->data($subj . "\r\n" . $body))) {
          if (PEAR::isError($smtp->data($body, $header))) {
              throw new Exception("Unable to send email\n");
          }
          /* Disconnect from the SMTP server. */
          $smtp->disconnect();
      } catch (Exception $e) {
          Analog::log("Error: ".$e->getMessage(), Analog::ERROR);
          return false;
      }

      return true;
  }


  function sendOptIn($to)
  {
      global $cfg;
      global $database;
      Analog::log("opt in for ".$to, Analog::DEBUG);

      // generate the codes for mail
      $mcode = hash("md5", uniqid($to, true));

      try {
          $user = $database->select("users", "id", ["email" => $to]);
          Analog::log("searching user ".$to." returned ".json_encode($user), Analog::DEBUG);
          if (count($user) > 0) {
              $uid = $user[0];
              $database->update("users", ["mcode" => $mcode], ["id" => $uid]);
              $err = $database->error();
              if ($err[0] != 0) {
                  throw new Exception($err[2]);
              }
              Analog::log("Updating mcode for user ".$uid, Analog::DEBUG);
          } else {
              Analog::log("Inserting user ".$to, Analog::DEBUG);
              $newUser = array();
              $newUser["email"] = $to;
              $newUser["mcode"] = $mcode;
              $database->insert("users", $newUser);
              $err = $database->error();
              // if OK, $err[0] is 0
              // on error, $err[] != 0 and $err[2] is error string
              if ($err[0] != 0) {
                  throw new Exception($err[2]);
              } else {
                  $user = $database->select("users", "id", ["email" => $to]);
                  if (count($user) == 0) {
                      throw new Exception("New user but not found on ".$to);
                  }
                  $uid = $user[0];
                  Analog::log("searching user ".$to." returned ".$uid, Analog::DEBUG);
              }
          }

          Analog::log("Registration code created", Analog::DEBUG);
      } catch (Exception $e) {
          Analog::log("Error".$e->getMessage(), Analog::ERROR);
          return false;
      }

      // mail
      try {
          // set time zone for date usage later on
          // create text
          $body = "Hallo\n\n";
		  $body .= "Wir haben eine Anmeldung zum Karlsruher Datenspiel erhalten\r\n";
		  $body .= "Wenn Du mitmachen möchtest, klicke bitte auf diesen Link, um die Anmeldung abzuschliessen.\r\n";
		  $body .= "Wenn Du nicht mitmachen möchtest, kannst Du diese Nachricht einfach löschen.\r\n\r\n";
          // add confirmation link
          $mode = "https://";
          if (!isset($_SERVER['HTTPS']) || $_SERVER['HTTPS'] == 'off') {
              $mode = "http://";
          }
          $body .= $mode . $_SERVER["SERVER_NAME"] . "/confirm/" . $mcode . "\r\n\r\n";
		  $body .= "Vielen Dank\r\n";
          Analog::log("Sending mail: ".$body, Analog::DEBUG);
          if (!sendSmtp($to, $body)) {
              throw new Exception("SMTP failed");
          }
      } catch (Exception $e) {
          Analog::log("Error".$e->getMessage(), Analog::ERROR);
          return false;
      }
      return true;
  }


	// login check
	function checkLogin($cookie) {
      global $database;
      Analog::log("Login check for cookie ".$cookie, Analog::DEBUG);

      try {
          $user = $database->select("users", "id", ["cookie" => $cookie]);
          Analog::log("searching user returned id ".json_encode($user), Analog::DEBUG);
          if (count($user) == 0) {
			  throw new Exception("Cookie not valid");
          } else {
              $uid = $user[0];
			  // check if we have a verification code already
	          if ($database->count("confirms", ["user" => $uid])) {
                Analog::log("Found verified user ".$uid, Analog::DEBUG);
				return 2;
			  } else {
	            Analog::log("Found user ".$uid, Analog::DEBUG);
				return 1;
			  } 
          }

          Analog::log("User logged in", Analog::DEBUG);
      } catch (Exception $e) {
          Analog::log("Error".$e->getMessage(), Analog::ERROR);
          return 0;
      }
	}

  // --------------------------------------------------
  // callbacks
  // --------------------------------------------------
  function confirm($a)
  {
      global $database;
      Analog::log("Confirmation code ".$a, Analog::DEBUG);

      if (isset($a)) {
          $aa = htmlspecialchars($a);
          // find codes
          $user = $database->select("users", ["id","email"], ["mcode" => $aa]);
          if (count($user) == 0) {
              $msg = "Mailcode not valid";
              Analog::log($msg, Analog::DEBUG);
              $result["msg"] = $msg;
              throw new Exception($msg);
          }
          $uid = $user[0]["id"];
					$email = $user[0]["email"];
          Analog::log("searching mcode returned uid: ".$uid.", mail ".$email, Analog::DEBUG);
          // create (new) cookie
          $code = hash("sha256", uniqid($email."123", true)); // database
          // update
          $database->update("users", ["cookie" => $code], ["id" => $uid]);
          $err = $database->error();
          if ($err[0] != 0) {
              throw new Exception($err[2]);
          }
          Analog::log("Updating cookie for user ".$uid, Analog::DEBUG);

          // set the server cookie
          setcookie("kdgId", $code, time()+3600, "/", $_SERVER["SERVER_NAME"], 0, 0);
          Analog::log("Cookie set: " . $code, Analog::DEBUG);
          // dummy extra cookie
          setcookie("dummy", "xyz", time()+3600, "/", $_SERVER["SERVER_NAME"], 0, 0);
          //
          $f = file_get_contents("kdgConfirm.html");
          echo $f;
      } else {
          echo "Confirmation without data";
      }
  }

  // --------------------------------------------------
  // routing
  // --------------------------------------------------
  // Routing in Flight is done by matching a URL pattern with a callback function.

  // ---- errors ------
  Flight::map('notFound', function () {
      // Handle not found
      echo "Flight: not found";
  });


  // ---- links ------
  // route root to main html file
  Flight::route('/', function () {
      $f = file_get_contents("kdg.html");
      echo $f;
  });

  // email confirmation link
  Flight::route('/confirm/@a', function ($a) {
      confirm($a);
  });


  // ---- posts ------
  // registration
  Flight::route('POST /register', function () {
      global $database;
      $request = Flight::request();
      $type = $request->data->type;
      $mail = $request->data->email;
      Analog::log("Registration", Analog::DEBUG);
      Analog::log("Request: ".json_encode($request), Analog::DEBUG);
      Analog::log("Type: ".$type, Analog::DEBUG);
      Analog::log("Email: ".$mail, Analog::DEBUG);

      $e = filter_var($mail, FILTER_SANITIZE_STRING, FILTER_FLAG_STRIP_HIGH | FILTER_FLAG_STRIP_LOW | FILTER_SANITIZE_SPECIAL_CHARS);
      $email = filter_var($e, FILTER_VALIDATE_EMAIL);

      $result = array();
      $result["msg"] = "";
      $result["status"] = "1";
      $result["type"] = "registration";
      if (!$email) {
          $result["status"] = "0";
          $result["msg"] = "Ungültige EMail";
      } else {
          // send mail
          if (! sendOptIn($email)) {
              $result["status"] = "0";
              $result["msg"] = "Fehler beim sender der Mail";
          }
      }
      Analog::log("Result: ".json_encode($result), Analog::DEBUG);
      print Flight::json($result);
  });

  // login
  Flight::route('POST /login', function () {
      global $database;
      $request = Flight::request();
      $type = $request->data->type;
      $cookie = $request->data->cookie;
      Analog::log("Registration", Analog::DEBUG);
      Analog::log("Request: ".json_encode($request), Analog::DEBUG);
      Analog::log("Type: ".$type, Analog::DEBUG);
      Analog::log("Cookie: ".$cookie, Analog::DEBUG);

	  $res = checkLogin($cookie);

      $result = array();
      $result["msg"] = "";
      $result["status"] = (string)$res;
      $result["type"] = "login";

      Analog::log("Result: ".json_encode($result), Analog::DEBUG);
      print Flight::json($result);
  });


  // qr code verification
  Flight::route('POST /verify', function () {
      global $database;
      global $cfg;
      $request = Flight::request();
      $result = array();
      $result["status"] = "0";
      $result["type"] = "verify";
      $result["msg"] = "";

      try {
          $type = $request->data->type;
          $obj = $request->data->payload;
          Analog::log("Verify QR", Analog::DEBUG);
          Analog::log("Request: ".json_encode($request), Analog::DEBUG);
          Analog::log("Type: ".$type, Analog::DEBUG);

          // find user
          $cookie = $obj["cookie"];
          Analog::log("Provided cookie: ".$cookie, Analog::DEBUG);
          $user = $database->select("users", "id", ["cookie" => $cookie]);
          if (count($user) == 0) {
              Analog::log("Cookie not valid", Analog::DEBUG);
              $result["msg"] = "Invalid cookie";
              throw new Exception("Invalid cookie");
          }
          $uid = $user[0];
          Analog::log("searching user returned ".$uid, Analog::DEBUG);

		  // check code
		  $expectedCode = (string)(date('j.m.y')).$cfg["confseed"];
		  $expectedCode = "http://rg-asc.ziti.uni-heidelberg.de/kugel"; // test
          Analog::log("Expected code: ".$expectedCode, Analog::DEBUG);
          Analog::log("Provided code: ".$obj["qrcode"], Analog::DEBUG);

		  if ($obj["qrcode"] !== $expectedCode) {
			throw new Exception("Invalid QR code");
		  }

		  // insert code
          $database->insert("confirms", ["user" => $uid, "code" => $obj["qrcode"]]);
          $err = $database->error();
          // if OK, $err[0] is 0
          // on error, $err[] != 0 and $err[2] is error string
          if ($err[0] != 0) {
              throw new Exception($err[2]);
          }
		  $msg = "QR code inserted";
          Analog::log($msg, Analog::DEBUG);

          $result["msg"] = $msg;
          $result["status"] = "1";
      } catch (Exception $e) {
          Analog::log("Error", Analog::ERROR);
          $result["msg"] = "Error occured:".$e->getMessage();
      }

      Analog::log("Result: ".json_encode($result), Analog::DEBUG);
      print Flight::json($result);
  });

  // data upload
  Flight::route('POST /upload', function () {
      global $database;
      $request = Flight::request();
      $result = array();
      $result["status"] = "0";
      $result["type"] = "upload";
      $result["msg"] = "";

      try {
          $type = $request->data->type;
          $obj = $request->data->payload;
          Analog::log("Uploading image", Analog::DEBUG);
          Analog::log("Request: ".json_encode($request), Analog::DEBUG);
          Analog::log("Type: ".$type, Analog::DEBUG);
          Analog::log("Date: ".$obj["date"], Analog::DEBUG);

          // find user
          $cookie = $obj["cookie"];
          Analog::log("Provided cookie: ".$cookie, Analog::DEBUG);
          $user = $database->select("users", "id", ["cookie" => $cookie]);
          if (count($user) == 0) {
              Analog::log("Cookie not valid", Analog::DEBUG);
              $result["msg"] = "Invalid cookie";
              throw new Exception("Invalid cookie");
          }
          $uid = $user[0];
          Analog::log("searching user returned ".$uid, Analog::DEBUG);

          // process image
          //Analog::log("Cookie: ".$obj["cookie"],Analog::DEBUG);
          //Analog::log("Comment: ".$obj["comment"],Analog::DEBUG);
          // write image, first remove mime type from string (up to first ,)
          // databse works, so no storage of full image as full. just the thimbnails (further down)
          // file_put_contents ("img.jpg", base64_decode(trim(strpbrk($obj["data"],","),",")));

          // using gd2 for thumbnails
          $source_image = imagecreatefromstring(base64_decode(trim(strpbrk($obj["data"], ","), ",")));
          // we could use this to write the file here: imagejpeg($virtual_image, "thumb_".$imgId."jpg");

          $width = imagesx($source_image);
          $height = imagesy($source_image);
          $desired_width = 128;

          $crop = false; // True;

          if ($crop) {
              // crop image for thumbnail
              $size = min($width, $height);
              //$cropped_image = imagecrop($source_image, ['x' => 0, 'y' => 0, 'width' => $size, 'height' => $size]);
              $cropped_image = imagecrop($source_image, ['x' => ($width-$size)/2, 'y' => ($height-$size)/2, 'width' => $size, 'height' => $size]);

              $width = imagesx($cropped_image);
              $height = imagesy($cropped_image);
              $desired_width = 128;
              $desired_height = floor($height * ($desired_width / $width));
              Analog::log("Thumbnail :".strval($desired_width).",".strval($desired_height), Analog::DEBUG);

              $virtual_image = imagecreatetruecolor($desired_width, $desired_height);
              /* copy source image at a resized size */
              imagecopyresampled($virtual_image, $cropped_image, 0, 0, 0, 0, $desired_width, $desired_height, $width, $height);
          } else {
              $desired_height = floor($height * ($desired_width / $width));
              Analog::log("Thumbnail :".strval($desired_width).",".strval($desired_height), Analog::DEBUG);

              $virtual_image = imagecreatetruecolor($desired_width, $desired_height);
              /* copy source image at a resized size */
              imagecopyresampled($virtual_image, $source_image, 0, 0, 0, 0, $desired_width, $desired_height, $width, $height);
          }

          // enter int database
          //Analog::log("Processing: ".json_encode($obj),Analog::DEBUG);
          $new = array();
          $new["user"] = $uid;
          // $new["created"] = $obj["date"];  // use mysql timestamp
          $new["location"] = $obj["location"];
          $new["lat"] = $obj["geo"][0];
          $new["long"] = $obj["geo"][1];
          $new["comment"] = $obj["comment"];
          $new["tag"] = $obj["tag"];
          // images must be converted
          ob_start();
          imagejpeg($source_image);
          $image_string = ob_get_contents();
          ob_end_flush();
          $new["privimg"] = $image_string;
          //$new["pubimg"] = null;
          // pubimage will be inserted after image recognition.
          // then also update thumbnail
          ob_start();
          imagejpeg($virtual_image);
          $image_string = ob_get_contents();
          ob_end_flush();
          $new["thumb"] = $image_string;

          // clean up image storage
          imagedestroy($virtual_image);
          imagedestroy($source_image);

          //Analog::log("New image: ".json_encode($new),Analog::DEBUG);
          // insert
          $database->insert("uploads", $new);
          $err = $database->error();
          // if OK, $err[0] is 0
          // on error, $err[] != 0 and $err[2] is error string
          if ($err[0] != 0) {
              throw new Exception($err[2]);
          }
          $imgId = $database->id();

          Analog::log("Image inserted: ".$imgId, Analog::DEBUG);

          /* create the physical thumbnail image to its destination */
          // we can directly write the blob to a file
          file_put_contents("thumb_".$imgId.".jpg", $new["thumb"]);
          //file_put_contents("img_".$imgId.".jpg",$new["privimg"]);

          //
          $result["msg"] = "Image uploaded";
          $result["status"] = "1";
      } catch (Exception $e) {
          Analog::log("Error", Analog::ERROR);
          $result["msg"] = "Error occured:".$e->getMessage();
      }

      Analog::log("Result: ".json_encode($result), Analog::DEBUG);
      print Flight::json($result);
  });

  // get current hostspots
  Flight::route('POST /hotspots', function () {
      global $database;
      $request = Flight::request();
      $type = $request->data->type;
      $obj = $request->data->payload;
      print Flight::json(array('message' => $form, 'code' => 0));
  });

  // get user spots
  Flight::route('POST /userspots', function () {
      global $database;
      $request = Flight::request();
      $type = $request->data->type;
      $obj = $request->data->payload;
      print Flight::json(array('message' => $form, 'code' => 0));
  });

  // get statistics
  Flight::route('POST /statistics', function () {
      global $database;
      $request = Flight::request();
      $type = $request->data->type;
      $obj = $request->data->payload;
      print Flight::json(array('message' => $form, 'code' => 0));
  });

  // browser log
  Flight::route('POST /log', function () {
      $request = Flight::request();
      $result = array();
      $result["status"] = "1";
      $result["type"] = "log";
      $result["msg"] = "Log OK";
      $type = $request->data->type;
      $agent = $request->data->agent;
      $log = $request->data->log;
      if ($type == "log") {
          Analog::log("Browser - ".$agent . ": " . $log, Analog::DEBUG);
      } else {
          $result["status"] = "0";
          $result["msg"] = "Wrong type";
      }
      print Flight::json($result);
  });


  // start framework
  // this seems to work so far ...
  Analog::log("Starting flight", Analog::NOTICE);
  Flight::start();
