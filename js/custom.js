// custom js, a. kugel
"use strict";

// a couple of global variables
const kdgCookie = "kdgId"
var cookie = "";
var verified = false;

// remote logging on/off
var remLogEnable = true // turn off in production ...
function remLog(l) { // log function
  console.log(l) // local console
  if (remLogEnable) {
    fetch("/log", {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        method: "POST",
        body: JSON.stringify({
          type: "log",
          agent: navigator.userAgent,
          log: l
        })
      })
      .then(function(response) {
        return response.json();
      })
      .then(function(myJson) {
        console.log("Fetch response: ", JSON.stringify(myJson));
      })
      .catch(function(err) {
        // Error: response error, request timeout or runtime error
        console.log('fetch error! ', err);
      });
  }
}

var shareloc = {
  "status": "null"
}; // don't use "location" as variable name!

var regcomplete = false; // true after verification

// registration states
// start, fresh, registered, validated
const regStates = {
  ST: "ST",
  SF: "SF",
  SR: "SR",
  SV: "SV"
}
var state = regStates.ST // start in ST
// usage:

var cswitch = false;
var infoswitch;

var useGps;

var sharedImageURL;

var kaPois;
var poisLoaded = false;

// screen dimensions
var scW
var scH

// test frame counter
var fcnt = 0

// tab handling
function openTab(evt, tabName) {
  var i, tabcontent, tablinks;
  console.log(tabName)
  tabcontent = document.getElementsByClassName("tabcontent");
  for (i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = "none";
  }
  tablinks = document.getElementsByClassName("tablinks");
  for (i = 0; i < tablinks.length; i++) {
    tablinks[i].className = tablinks[i].className.replace(" active", "");
  }
  document.getElementById(tabName).style.display = "block";
  evt.currentTarget.className += " active";


  // update reg id
  if (tabName == "registerTab") {

    // 3 options:
    // not registered (no cookie)
    // registered (cookie is set)
    // completed (cookie is verified)
    switch (state) {
      case regStates.SR:
        w3.addClass("#regDue", "w3-hide")
        w3.removeClass("#regQr", "w3-hide")
        w3.removeClass("#regDone", "w3-hide")
        w3.removeClass("#qrvideo", "w3-hide")
        getQR();
        break;
      case regStates.SV:
        w3.addClass("#regDue", "w3-hide")
        w3.addClass("#regQr", "w3-hide")
        w3.removeClass("#regDone", "w3-hide")
        w3.addClass("#qrvideo", "w3-hide")
        break;
        /*
        case regStates.SF:
          w3.removeClass("#regDue", "w3-hide")
          w3.addClass("#regDone", "w3-hide")
          w3.addClass("#regQr", "w3-hide")
        break;
        */
      default:
        w3.removeClass("#regDue", "w3-hide")
        w3.addClass("#regDone", "w3-hide")
        w3.addClass("#regQr", "w3-hide")
        break;

    }

    /*
    if (cookie != "") {
      // dummy:
      // regcomplete = true
      if (regcomplete) {
        // all done
        w3.addClass("#regDue", "w3-hide")
        w3.addClass("#regQr", "w3-hide")
        w3.removeClass("#regDone", "w3-hide")
      } else {
        // qr scan missing
        w3.addClass("#regDue", "w3-hide")
        w3.removeClass("#regQr", "w3-hide")
        w3.addClass("#regDone", "w3-hide")
        getId();
        getQR();
      }
    } else {
      w3.addClass("#regDone", "w3-hide")
      //w3.removeClass("#intro", "w3-hide")
      w3.removeClass("#regDue", "w3-hide")
      w3.addClass("#regQr", "w3-hide")
      // normally, we would do this first, but then we can
      // never check if it works ...
    }
    */
  }

  // tab actions
  if (tabName == "shareTab") {
    useGps = true; // try high accuracy first
    locateOnly() // start location
    share()
  } else {
    {
      // close video
      const video = document.getElementById('monitor');
      let stream = video.srcObject;
      if (stream) {
        remLog("Closing video stream")
        let tracks = stream.getTracks();
        tracks.forEach(function(track) {
          track.stop();
        });
        video.srcObject = null;
      }
    } {
      // close qrvideo
      const video = document.getElementById('qrvideo');
      let stream = video.srcObject;
      if (stream) {
        let tracks = stream.getTracks();
        tracks.forEach(function(track) {
          track.stop();
        });
        video.srcObject = null;
      }
    }
  }

  if (tabName == "viewTab") {
    if (shareloc.status == "ok") {
      showMap(shareloc.lat, shareloc.long)
    } else {
      locate()
    }
  }

  if (tabName == "statusTab") {
    var char = makeChart()
  }

  if (tabName == "infoTab") {
    // no action yet
  }

}

// cookie handling
function getId() {
  if (cookie && (cookie != "")) return cookie;
  if (typeof(Storage) !== "undefined") {
    let ck = localStorage.getItem(kdgCookie);
    if (!ck || (ck == "")) {
      cookie = ck;
    } else {
      cookie = "";
    }
  }
  document.getElementById("regId").innerHTML = cookie;
  return cookie;
}

function clearId() {
  cookie = "";
  // clear php cookie
  document.cookie = kdgCookie+"=\"\"; max-age=0; path=/;"
  // clear local storage
  if (typeof(Storage) != "undefined") {
    localStorage.removeItem(kdgCookie);
  }
  state = regStates.ST
  onLoad()
}

// --------------- color switch -------------------
function toggleColor() {
  cswitch = !cswitch; // toggle
  w3.toggleClass("body", "darklight", "brightlight")
  // also change diagram axis colors
  if (cswitch) {
    // black background
    w3.addStyle('.c3-axis path', 'stroke', 'white')
    w3.addStyle('.c3-axis text', 'fill', 'white')
  } else {
    w3.addStyle('.c3-axis path', 'stroke', 'black')
    w3.addStyle('.c3-axis text', 'fill', 'black')
  }
}

// ---------------- geolocation ----------------------
function locateOnly() {

  function success(position) {
    const lat = position.coords.latitude;
    const long = position.coords.longitude;

    // update global Geolocation
    shareloc = {
      "status": "ok",
      "lat": lat,
      "long": long
    };
    remLog("location OK: " + shareloc.lat + "/ " + shareloc.long)
  }

  function error() {
    if (useGps) {
      useGps = false
      remLog("Retry no GPS")
      shareloc = {
        "status": "retry"
      };
      let options = {
        maximumAge: 1,
        enableHighAccuracy: false,
        desiredAccuracy: 50,
        maxWait: 5000,
        timeout: 5000
      }
      if (navigator.appCodeName == "Mozilla") {
        // no options for mozilla
        navigator.geolocation.getCurrentPosition(success, error);
      } else {
        navigator.geolocation.getCurrentPosition(success, error, options);
      }
    } else {
      shareloc = {
        "status": "fail"
      };
      remLog("location failed")
    }
  }

  if (!navigator.geolocation) {
    remLog('Geolocation is not supported by your browser');
    shareloc = {
      "status": "null"
    };
  } else {
    remLog("Try with GPS")

    let options = {
      maximumAge: 1,
      enableHighAccuracy: true,
      desiredAccuracy: 50,
      maxWait: 5000,
      timeout: 5000
    }
    if (navigator.appCodeName == "Mozilla") {
      // no options for mozilla
      navigator.geolocation.getCurrentPosition(success, error);
    } else {
      navigator.geolocation.getCurrentPosition(success, error, options);
    }
  }
}

// ---------------- leaflet ----------------------
// get location from geoloc code above
function showMap(lat, long) {
  //if (L.map('mapId')) L.map('mapId').remove()
  var container = L.DomUtil.get('mapId');
  if (container != null) {
    container._leaflet_id = null;
  }
  //
  //const kaLat = {"center":49.004,"min":49.025,"max":49.989};
  const kaLat = {
    "center": 49.004,
    "min": 48.99,
    "max": 49.989
  };
  const kaLong = {
    "center": 8.403,
    "min": 8.355,
    "max": 8.429
  };
  const p1 = L.point(kaLat.min, kaLong.min);
  const p2 = L.point(kaLat.max, kaLong.max);
  const bounds = L.bounds(p1, p2);
  var kdgMap = L.map('mapId').setView([kaLat.center, kaLong.center], 13);
  var marker

  if ((lat < kaLat.min) || (lat > kaLat.max) || (long < kaLong.min) || (long > kaLong.max)) {
    alert("Position outside KA map " + lat + "," + long)
  } else {
    marker = L.marker([lat, long]).addTo(kdgMap);
    marker.bindPopup("<b>This is your position</b>").openPopup();
  }


  var poiLayer = new L.LayerGroup();
  var goodIcon = L.icon({
    iconUrl: 'img/good.png', // pull out values as desired from the feature feature.properties.style.externalGraphic.
    iconSize: [32, 32], // size of the icon
    iconAnchor: [16, 16], // point of the icon which will correspond to marker's location
    /*shadowUrl: 'img/goodMarkerShadow.png',
    shadowSize:   [50, 64], // size of the shadow
    shadowAnchor: [4, 62],  // the same for the shadow
    */
    popupAnchor: [0, 16] // point from which the popup should open relative to the iconAnchor
  });
  var badIcon = L.icon({
    iconUrl: 'img/bad.png', // pull out values as desired from the feature feature.properties.style.externalGraphic.
    iconSize: [32, 32], // size of the icon
    iconAnchor: [16, 16], // point of the icon which will correspond to marker's location
    /*shadowUrl: 'img/goodMarkerShadow.png',
    shadowSize:   [50, 64], // size of the shadow
    shadowAnchor: [4, 62],  // the same for the shadow
    */
    popupAnchor: [0, 16] // point from which the popup should open relative to the iconAnchor
  });
  var pinIcon = L.icon({
    iconUrl: 'img/pin.png', // pull out values as desired from the feature feature.properties.style.externalGraphic.
    iconSize: [32, 32], // size of the icon
    iconAnchor: [16, 16], // point of the icon which will correspond to marker's location
    /*shadowUrl: 'img/goodMarkerShadow.png',
    shadowSize:   [50, 64], // size of the shadow
    shadowAnchor: [4, 62],  // the same for the shadow
    */
    popupAnchor: [0, 16] // point from which the popup should open relative to the iconAnchor
  });

  for (var p in kaPois.info) {
    /*
	var goodIcon = L.icon({
        iconUrl: 'img/goodMarker.png', // pull out values as desired from the feature feature.properties.style.externalGraphic.
		iconSize:     [38, 95], // size of the icon
		iconAnchor:   [22, 94], // point of the icon which will correspond to marker's location
        shadowUrl: 'img/goodMarkerShadow.png',
		shadowSize:   [50, 64], // size of the shadow
		shadowAnchor: [4, 62],  // the same for the shadow
		popupAnchor:  [-3, -76] // point from which the popup should open relative to the iconAnchor
    });
    marker = L.marker([50.505, 30.57], {icon: myIcon}).bindPopup("Hi there").addTo(markers);;
map.addLayer(markers);
	*/

    var pm
    //pm = L.marker([kaPois.info[p].geo[1],kaPois.info[p].geo[0]]).addTo(kdgMap);
    pm = L.marker([kaPois.info[p].geo[1], kaPois.info[p].geo[0]], {
      icon: badIcon
    }).addTo(poiLayer);
    pm.bindPopup("<b>" + kaPois.info[p].name + "</b>")
  }
  kdgMap.addLayer(poiLayer);


  L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
    maxZoom: 18,
    maxBounds: bounds,
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' +
      '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
      'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    id: 'mapbox.streets'
  }).addTo(kdgMap);
}

function locate() {
  const status = document.querySelector('#mapStatus');

  // clear

  function success(position) {
    const lat = position.coords.latitude;
    const long = position.coords.longitude;

    status.textContent = "lat, long: " + lat + "," + long;
    // update global Geolocation
    shareloc = {
      "status": "ok",
      "lat": lat,
      "long": long
    };
    remLog("location OK")

    while (!poisLoaded) {
      remLog("wait pois")
    }

    showMap(lat, long)

  }

  function error() {
    status.textContent = 'Unable to retrieve your location';
    shareloc = {
      "status": "fail"
    };
    remLog("location failed")
  }

  if (!navigator.geolocation) {
    status.textContent = 'Geolocation is not supported by your browser';
    shareloc = {
      "status": "null"
    };
  } else {
    status.textContent = 'Locating…';
    let options = {
      maximumAge: 1,
      enableHighAccuracy: false,
      desiredAccuracy: 50,
      maxWait: 5000,
      timeout: 5000
    }
    console.log("Locate low res")
    if (navigator.appCodeName == "Mozilla") {
      // no options for mozilla
      navigator.geolocation.getCurrentPosition(success, error);
    } else {
      navigator.geolocation.getCurrentPosition(success, error, options);
    }
  }
}

// -------------- image capture ----------------
function share() {
  console.log("Sharing started")
  const video = document.getElementById('monitor');
  const canvas = document.getElementById('photo');
  const shutterBtn = document.getElementById('shutter');
  const previewBtn = document.getElementById('preview');

  // Access the device camera and stream to cameraView
  function cameraStart() {
    navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "environment",
          width: {
            ideal: 1280
          },
          height: {
            ideal: 720
          }
        }
      })
      .then(function(stream) {
        remLog("Share stream open")
        video.srcObject = stream;
        video.setAttribute("playsinline", true); // required to tell iOS safari we don't want fullscreen
        video.play();
      })
      .catch(function(error) {
        remLog("Sharing camera: Something is broken. " + error);
      });
  }

  shutterBtn.onclick = () => {
    remLog("canvas w/h: " + canvas.width + "/" + canvas.height + "video w/h: " + video.videoWidth + "/" + video.videoHeight)

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    canvas.getContext('2d').drawImage(video, 0, 0);
    //
    sharedImageURL = canvas.toDataURL('image/jpeg',0.9);
    remLog("Img len: " + sharedImageURL.length)

	// restart locating
  	locateOnly()

    //
    w3.addClass("#monitor", "w3-hide")
    w3.addClass("#shutter", "w3-hide");
    w3.removeClass("#photo", "w3-hide")
    w3.removeClass("#preview", "w3-hide");
    w3.removeClass("#shareInput", "w3-hide");
    let down = document.getElementById("down")
    down.innerHTML = "Gut oder schlecht?"
  }

  previewBtn.onclick = () => {
    w3.addClass("#preview", "w3-hide");
    w3.addClass("#photo", "w3-hide");
    w3.removeClass("#monitor", "w3-hide");
    w3.removeClass("#shutter", "w3-hide");
    w3.addClass("#shareInput", "w3-hide");
    let down = document.getElementById("down")
    down.innerHTML = "Vorschau"
  }

  remLog("Starting camera")
  locateOnly()
  updateImgSize()
  cameraStart()

}

/* ***** initial code, not working on iphone **
//window.onload = async () => {
async function share() {
  const video = document.getElementById('monitor');
  const canvas = document.getElementById('photo');
  const shutterBtn = document.getElementById('shutter');
  const previewBtn = document.getElementById('preview');

  // if event handler not working, we can call the function directly
  // updateImgSize()

  try {
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "environment",
        width: {
          ideal: 1280
        },
        height: {
          ideal: 720
        }
      }
    });

    await new Promise((resolve) => video.onloadedmetadata = resolve);
    //console.log("canvas w/h: " + canvas.width + "/" + canvas.height + "video w/h: " + video.videoWidth + "/" + video.videoHeight)
    //canvas.width = video.videoWidth;
    //canvas.height = video.videoHeight;

    shutterBtn.onclick = () => {
      console.log("canvas w/h: " + canvas.width + "/" + canvas.height + "video w/h: " + video.videoWidth + "/" + video.videoHeight)

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      canvas.getContext('2d').drawImage(video, 0, 0);
      //
      sharedImageURL = canvas.toDataURL('image/png');
      console.log("Len: " + sharedImageURL.length)

      //
      w3.addClass("#monitor", "w3-hide")
      w3.addClass("#shutter", "w3-hide");
      w3.removeClass("#photo", "w3-hide")
      w3.removeClass("#preview", "w3-hide");
      w3.removeClass("#shareInput", "w3-hide");
    }

    previewBtn.onclick = () => {
      w3.addClass("#preview", "w3-hide");
      w3.addClass("#photo", "w3-hide");
      w3.removeClass("#monitor", "w3-hide");
      w3.removeClass("#shutter", "w3-hide");
      w3.addClass("#shareInput", "w3-hide");
      let down = document.getElementById("down")
      down.innerHTML = "Take foto"

    }

  } catch (err) {
    console.log(err);
    //console.error(err);
  }

};

***** */

// ---------- vibration -----------
// duration is in ms, can be a list for pattern
function startVibrate(duration) {
  console.log("Vibrate")
  try {
    navigator.vibrate(duration);
  } catch (err) {
    console.log(err);
    //console.error(err);
  }
}

// ---------- chart ----------------
function makeChart() {
  var char = c3.generate({
    bindto: '#chart',
    data: {
      x: 'x',
      //        xFormat: '%Y%m%d', // 'xFormat' can be used as custom format of 'x'
      columns: [
        ['x', '2019-01-01', '2019-01-02', '2019-01-03', '2019-01-04', '2019-01-05', '2019-01-06'],
        ['Gesamt', 30, 200, 100, 400, 150, 250],
        ['Mittel', 50, 20, 10, 40, 15, 25],
        ['Selbst', 55, 25, 15, 45, 10, 20]
      ]
    },
    axis: {
      x: {
        type: 'timeseries',
        tick: {
          format: '%Y-%m-%d'
        }
      },
      y: {
        label: { // ADD
          text: 'Beiträge',
          position: 'outer-middle'
        }
      }
    }
  });
}

// ---------- QR code ----------------
function getQR() {
  //var video = document.getcreateElement("video");
  var video = document.getElementById("qrvideo");

  // Use facingMode: environment to attemt to get the front camera on phones
  navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "environment"
    }
  }).then(function(stream) {
    video.srcObject = stream;
    video.setAttribute("playsinline", true); // required to tell iOS safari we don't want fullscreen
    video.play();
    requestAnimationFrame(tick);
  });

  function tick() {
    var codeFound = false
    var canvasElement = document.getElementById("qrcanvas");
    var canvas = canvasElement.getContext("2d");
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      //canvasElement.height = video.videoHeight;
      //canvasElement.width = video.videoWidth;

      //canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
      canvas.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, canvasElement.width, canvasElement.height);

      var imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
      var code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });
      if (code) {
        codeFound = true
		qrsend(code.data)		
      }
    }
    if (!codeFound)
      requestAnimationFrame(tick);
    else {
      startVibrate(200);
      // close qrvideo
      const video = document.getElementById('qrvideo');
      let stream = video.srcObject;
      if (stream) {
        let tracks = stream.getTracks();
        tracks.forEach(function(track) {
          track.stop();
        });
        video.srcObject = null;
      }
      w3.addClass("#qrvideo", "w3-hide")
    }
  }
}

// --------- submit registration ------------
function registration() {
  // need the following: email, qrcode
  let regmail = document.getElementById('email').value
  if (regmail != "") {
    remLog("Registering ")
    fetch("/register", {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        method: "POST",
        body: JSON.stringify({
          type: "registration",
          email: regmail
        })
      })
      .then(function(response) {
        return response.json();
      })
      .then(function(myJson) {
        remLog("Fetch response: " + JSON.stringify(myJson));
        alert("Wir haben Dir eine E-Mail zur Bestätigung Deiner Anmeldung geschickt. \
      Bitte schaue in Dein Mailprogramm und folge den Anweisungen")
        document.getElementById('email').value = ""
      })
      .catch(function(err) {
        // Error: response error, request timeout or runtime error
        remLog('fetch post error! ' + err);
      });

  } else {
    alert("Bitte die E-Mail eingeben!")
  }
}

// ------- upload data set ---------------
function upload(tag) {
  let d = new Date();
  let msg = "Upload from " + tag + "Date: " + d;
  if (shareloc.status == "ok") {
    msg += "lat " + shareloc.lat + ", long " + shareloc.long
  }
  let comment = document.getElementById("shareComment").value
  let location = document.getElementById("shareLocation").value
  msg += ", comment: " + comment;
  msg += ", location: " + location;
  msg += ", img size: " + sharedImageURL.length

  // ----------------
  // for testing download the image ...
  let down = document.getElementById("down")
  down.innerHTML = "Download"
  down.href = sharedImageURL
  down.download = "down_" + tag + ".jpeg"
  // ----------------

  // now create the data object ....
  let img = {}
  img.cookie = cookie
  img.tag = tag
  img.date = d
  img.comment = comment || ""
  img.location = location || ""
  img.geo = [shareloc.lat || 0, shareloc.long || 0]
  // dataurl is base64 encoded string, ok to upload
  img.data = sharedImageURL
  // create the JSON object
  /*
  let imgJson = JSON.stringify(img)
  let i
  for (i=0;i<250;i++) {
    console.log(imgJson[i])
  }
  */

  // upoad the image: test

  remLog("Posting img")
  fetch("/upload", {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      method: "POST",
      body: JSON.stringify({
        type: "upload",
        payload: img
      })
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(resp) {
      console.log("Fetch response: ", JSON.stringify(resp));
      if (resp.status == 1) {
        alert("Dein Foto wurde gespeichert")
      } else {
        alert("Leider gab es einen Fehler. Bitte versuche es später nochmal")
      }
    })
    .catch(function(err) {
      // Error: response error, request timeout or runtime error
      console.log('fetch post error! ', err);
    });

  //
  startVibrate(200);
  //alert(msg)

}

function qrsend(code) {
	remLog("Sending qrcode " + code)
	// create data object
	let qr = {}
	qr.cookie = cookie
	qr.qrcode = code
	// send data
    fetch("/verify", {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        method: "POST",
        body: JSON.stringify({
          type: "verify",
		  payload: qr
        })
      })
      .then(function(response) {
        return response.json();
      })
      .then(function(resp) {
        remLog("Fetch response: " + JSON.stringify(resp));
		if (resp.status == 0) {
        	alert("Das war leider nicht der richtige Code. Versuche es später nochmal")
		} else {
        	alert("Danke für den QR Code")
		    remLog("QRCode ok: " + code)
		    remLog("Swiching state from " + state + " to " + regStates.SV)
			state = regStates.SV;
			verified = true;
		}
      })
      .catch(function(err) {
        // Error: response error, request timeout or runtime error
        remLog('fetch post error! ' + err);
      });

}


// hide/show info fields
// --------------- intro switch -------------------
//shareIntro, shareIntroInfo
function showIntro() {
  w3.removeClass("#shareIntro", "w3-hide")
  w3.addClass("#shareIntroShow", "w3-hide")
}

function hideIntro() {
  w3.addClass("#shareIntro", "w3-hide")
  w3.removeClass("#shareIntroShow", "w3-hide")
}

// --------------- display switch -------------------
//shareIntro, shareIntroInfo
function showView() {
  w3.removeClass("#viewIntro", "w3-hide")
  w3.addClass("#viewIntroShow", "w3-hide")
}

function hideView() {
  w3.addClass("#viewIntro", "w3-hide")
  w3.removeClass("#viewIntroShow", "w3-hide")
}

// --------------- eval switch -------------------
//shareIntro, shareIntroInfo
function showStatus() {
  w3.removeClass("#statusIntro", "w3-hide")
  w3.addClass("#statusIntroShow", "w3-hide")
}

function hideStatus() {
  w3.addClass("#statusIntro", "w3-hide")
  w3.removeClass("#statusIntroShow", "w3-hide")
}

function toggleInstructions() {
  infoswitch = !infoswitch;
  if (infoswitch) {
    w3.removeClass("#intro", "w3-hide")
    showIntro();
    showView();
    showStatus();
  } else {
    w3.addClass("#intro", "w3-hide")
    hideIntro();
    hideView();
    hideStatus();
  }
  // also go full fullscreen
  /*
  requestFullscreen() can not be called automatically is because of security reasons (at least in Chrome). Therefore it can only be called by an user action such as:

  	click (button, link...)
  	key (keydown, keypress...)

  */
  //document.body.requestFullscreen();

}

/* check:
https://davidwalsh.name/orientation-change
http://www.williammalone.com/articles/html5-javascript-ios-orientation/
https://stackoverflow.com/questions/1649086/detect-rotation-of-android-phone-in-the-browser-with-javascript/6603537#6603537

*/

function updateImgSize() {
  /* scW = screen.width
  scH = screen.height
  */
  // swapped ?
  /* scW = window.innerWidth
  scH = window.innerHeight*/
  // might need delay prior to getting values
  window.setTimeout(function() {

	  scW = window.innerWidth
	  scH = window.innerHeight
	  remLog("orientation change, W/H:" + scW + "/" + scH)
	  // if scW>scH set H=scH*.5, W=16/9*H
	  // set the dimension of the monitor and photo elements
	  let w, h
	  // warning: 16/is only true if we get the requested HD video format!
	  if (scW >= scH) {
		remLog("Wide")
		h = Math.round(.5 * scH) // half height
		w = Math.round(16 / 9 * h)
	  } else {
		// reverse
		remLog("High")
		h = Math.round(scH * .7) // almost full height
		w = Math.round(h * 9 / 16)
	  }
	  let ws = w.toString() + "px";
	  let hs = h.toString() + "px"
	  document.getElementById('monitor').style.width = ws;
	  document.getElementById('monitor').style.height = hs;
	  document.getElementById('photo').style.width = ws;
	  document.getElementById('photo').style.height = hs;
	}, 500);

}

// getservercookie function copied from w3schools
function getServerCookie(cname) {
  var name = cname + "=";
  var decodedCookie = decodeURIComponent(document.cookie);
  var ca = decodedCookie.split(';');
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

// ARL: access local storage
function arl() {
  cookie = ""
  if (typeof(Storage) !== "undefined") {
    let ck = localStorage.getItem(kdgCookie);
    if (!ck || (ck == "")) {
      remLog("Local storage not set, checking cookie")
      ck = getServerCookie("kdgId")
      cookie = ck
      if (ck != "") {
        // set id from server cookie
        localStorage.setItem(kdgCookie, ck);
        remLog("Local storage updated with: " + cookie)
      } else {
        remLog("No cookie detected")
      }
    } else {
      cookie = ck
      remLog("Local storage ready with: " + cookie)
    }
  }
  if (cookie != ""){
	// login
	console.log("Try to login") 
    fetch("/login", {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        method: "POST",
        body: JSON.stringify({
          type: "login",
          cookie: cookie
        })
      })
      .then(function(response) {
        return response.json();
      })
      .then(function(resp) {
        console.log("Login response: ", JSON.stringify(resp));
		switch (resp.status) {
			case "1": 
				verified = false;
				remLog("Login OK, not verified")
			break;
			case "2": 
				verified = true;
				remLog("Login OK, verified")
			break;
			default:
				cookie = "";
				verified = false;
				remLog("Login failed")
		}
      })
      .catch(function(err) {
        // Error: response error, request timeout or runtime error
        console.log('fetch error! ', err);
		cookie = "";
      });

  }
  return (cookie != "")
}

// -------- startup: disable instructions
function onLoad() {
  remLog("State: " + state)
  switch (state) {
    case regStates.ST:
      /*
       * ARL
         * If ID => SR
       * ARC
         * If ID: AWL, => SR
       * => SF
      ...
      */
      if (arl()) {
		if (!verified) {
		    remLog("Swiching state from " + state + " to " + regStates.SR)
		    document.getElementById("regId").innerHTML = "Du bist angemeldet. Bitte scanne noch der QR-Code am SpaceCraft";
		    state = regStates.SR;
		    remLog("New state: " + state)
		    w3.addClass("#regDue", "w3-hide")
		    w3.removeClass("#regQr", "w3-hide")
		    w3.removeClass("#regDone", "w3-hide")
		    // enable the upload buttons
		    w3.removeClass("#goodScore","kdg-button-gray")
		    w3.removeClass("#badScore","kdg-button-gray")
		    document.getElementById("goodScore").disabled = false
		    document.getElementById("badScore").disabled = false
		} else {
		    remLog("Swiching state from " + state + " to " + regStates.SV)
		    document.getElementById("regId").innerHTML = "Du bist schon mit QR-Code angemeldet. Du kannst noch bei bei weiteren Veranstaltungen QR Punkte sammeln";
		    state = regStates.SV;
		    remLog("New state: " + state)
		    w3.addClass("#regDue", "w3-hide")
		    w3.removeClass("#regQr", "w3-hide")
		    w3.removeClass("#regDone", "w3-hide")
		    // enable the upload buttons
		    w3.removeClass("#goodScore","kdg-button-gray")
		    w3.removeClass("#badScore","kdg-button-gray")
		    document.getElementById("goodScore").disabled = false
		    document.getElementById("badScore").disabled = false
		}
      } else {
        remLog("Swiching state from " + state + " to " + regStates.SF)
        document.getElementById("regId").innerHTML = "Du bist noch nicht angemeldet";
        state = regStates.SF;
        remLog("New state: " + state)
        w3.removeClass("#regDue", "w3-hide")
        w3.addClass("#regQr", "w3-hide")
        w3.addClass("#regDone", "w3-hide")
        // disable the upload buttons
        w3.addClass("#goodScore","kdg-button-gray")
        w3.addClass("#badScore","kdg-button-gray")
        document.getElementById("goodScore").disabled = true
        document.getElementById("badScore").disabled = true
      }
      break;
    default:
      remLog("Resetting state to " + regStates.SF)
      document.getElementById("regId").innerHTML = "Du bist noch nicht angemeldet";
      document.getElementById("goodScore").disabled = true
      document.getElementById("badScore").disabled = true
      state = regStates.ST
      onLoad();
      break;
  }

  infoswitch = true;
  toggleInstructions();

  // start location
  locateOnly()

  // load geoportal data
  loadPois()
  // screen handler
  if (screen.orientation) {
    remLog("Screen orientation handler")
    updateImgSize() // inital call to have variables set
    screen.orientation.addEventListener("change", updateImgSize);
  } else {
    remLog("No screen orientation handler")
    if (window) {
      remLog("Window orientation handler")
      updateImgSize() // inital call to have variables set
      window.addEventListener("orientationchange", updateImgSize);
    } else {
      remLog("No window handler")
    }
  }
}


// -------- get PoI data from geoportal
function loadPois() {
  // define some test data if geoportal unavailable
  let testData = {
    "type": "FeatureCollection",
    "crs": {
      "type": "name",
      "properties": {
        "name": "EPSG:4326"
      }
    },
    "features": [{
        "type": "Feature",
        "geometry": {
          "type": "Point",
          "coordinates": [8.400170783538151, 49.00709328041582]
        },
        "properties": {
          "NAME": "Staatliches Museum für Naturkunde",
          "GRUPPENNAME_DE": "Museen, Ausstellungen",
          "UPDATED": 1538352000000
        }
      },
      {
        "type": "Feature",
        "geometry": {
          "type": "Point",
          "coordinates": [8.383544112981063, 49.00070066892714]
        },
        "properties": {
          "NAME": "Kultur-Institut Kunstsammlungen/Städtische Galerie",
          "GRUPPENNAME_DE": "Museen, Ausstellungen",
          "UPDATED": 1538352000000
        }
      }
    ]
  }

  // geo url
  let poiUrl = "https://geoportal.karlsruhe.de/server/rest/services/Stadtplan/Stadtplan_POIs_Kultur/MapServer/6/query?where=GRUPPENNAME_DE+%3D+%27Museen,%20Ausstellungen%27&outFields=NAME&returnGeometry=true&f=geojson"
  // load json from geoportal
  // doesnt work if portal is unavailable. use test data
  w3.getHttpObject(poiUrl, poiController);
  //poiController(testData)

  function poiController(geoObject) {
    console.log("processing object")
    // create new object
    kaPois = {
      "info": []
    }

    // get feature array
    let features = geoObject.features;
    console.log("Features: " + features.length)
    for (var f in features) {
      //console.log(JSON.stringify(features[f].properties.NAME))
      let x = {}
      x.name = features[f].properties.NAME
      x.geo = features[f].geometry.coordinates
      //console.log("geo: " + x.geo[0] + "," + x.geo[1])
      kaPois.info[f] = x
    }
    poisLoaded = true
    //console.log(JSON.stringify(kaPois))

    /*
	<ul id="geodata">
	  <li w3-repeat="info">{{name}} : {{geo}}</li>
	</ul>
    w3.displayObject("geodata", kaPois);
	*/

  }


}
// --------- drag and drop ---------------
/*
function allowDrop(ev) {
  ev.preventDefault();
}

function drag(ev) {
  ev.dataTransfer.setData("text", ev.target.id);
}

function drop(ev) {
  ev.preventDefault();
  var data = ev.dataTransfer.getData("text");
  ev.target.appendChild(document.getElementById(data));
}
*/
