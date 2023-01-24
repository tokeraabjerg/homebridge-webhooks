/*
!# Only thing left is to do a actual webhook response and implement config fetching, then deploy

//Handle request
//get accessory dump
//find device
//change device state
//get device service info
//get device value info

TODO:
! Respond info with webhook
! implement config fetching
! Deploy
*/

/*
    USAGE:

    192.168.1.148 (debug)

    /?GET or /?POST
        Get is for getting info from HomeBridge (getting the state of a light or getting all accessories)
        Post is for posting info to HomeBridge (turning a light on)

    /?GET/DEVICE_NAME
        Dumps all info (iid's) for a device

    /?GET/DEVICE_NAME/IID
        Get state on certain info (iid) (request info if a light is on or not)

    /?POST/DEVICE_NAME/IID/NEW_STATE
*/

const request = require("request");
const http = require("http");
const url = require("url");

const webhookIp = "192.168.1.171"
const webhookPort = "51830";
const auth = "589-00-356";

var dT = new Date();
    dT.t = dT.getTime()
var lastGetCall = -1;
var getRSP;

http.createServer(handleRequest).listen(webhookPort);


/*######################################*/
//        Handle webhook request        //
/*######################################*/

function handleRequest (req, resp) {

    var args = req.url.split("&")
        args[0] = args[0].substr( 2, args[0].length )
    
    console.log(args);

    

    /*for (var i=0;i<args.length;i++) {
        if(!validArgs.includes(args[i])) {
            console.log("Negative fella, invalid parameters")
        }
    }*/

    console.log(args[0], args[0] == "get")

    if(args[0].toLowerCase() == "post") {
        //put request for device change
        //console.log("Post request for &1", args[1])
        putRequest ("post", args[1], args[2], args[3], function (r) {
            if (r.error == -1) {
                console.log(r.str)
            } else {
                console.log(r)
            }
            handleResponse(r)
        });

    } else if (args[0].toLowerCase() == "get") {
        //get devices
        if (args[1] && !args[2]) {
            console.log("Getting services")
            servicesDump("services", args[1], function (r) {
                handleResponse(r)
            })

        } else if (args[1] && args[2]) {
            console.log("Getting value of device")
            valueDump("value", args[1], args[2], function (r) {
                if (r.error == -1) {
                    console.log(r.str)
                } else {
                    console.log(r)
                }
                handleResponse(r)
            })

        } else if (!args[1]) {
            console.log("Getting all devices to dump")
            accessoryDump(function (r) {
                //result
                handleResponse(r)
            });
        }

    } else {
        //return error
        handleResponse({"error": "0", "reason": "No parameters specificed."})

    }
    function handleResponse(respBody) {
        resp.setHeader('Content-Type', "application/json")
        resp.write(JSON.stringify(respBody))
        resp.end();
    }
}


/*######################################*/
//         Change device value          //
/*######################################*/

function putRequest (type, accessory, iidStr, value, callback) {
    findDevice(type, accessory, iidStr, value, function (aid, iid, fValue, callback2) {

        console.log("The send body is: { \"characteristics\": [{ \"aid\": "+aid+", \"iid\": "+iid+", \"value\": "+value+"}] }")
        request({
            method: "PUT",
            url:"http://192.168.1.171:51826/characteristics",
            headers: {"Content-Type":"Application/json", "authorization": "589-00-356"},
            body: "{ \"characteristics\": [{ \"aid\": "+aid+", \"iid\": "+iid+", \"value\": "+value+"}] }"
    
        }, function (error, response, body) {
            //console.log('rsp:', response); 

            //if request passed then do callback to confirm the new value of the device
            if(response == undefined) {
                callback(
                    {"error": 1, "str": "Connection error, expected response but got nothing. Possibly connection or configuration error."}
                    )
            } else if (response.client._hadError == true) {
                callback(
                    {"error": 0, "str": "Unexpected error, reponse dump following:", "dump": response}
                )
            } else if (response.client._hadError == false) {
                callback (
                    {"error": -1, "str": "Success!"}
                )
            }
        })
    })
}

/*######################################*/
//           Dump accessories           //
/*######################################*/

function findDevice (type, accessory, iidStr, value, callback) {
    var notFound = true
    var fAid; var fIid; var fValue; var fServices;

    accessoryDump(function (accessories) {
        for(var i=0; i < accessories.accessories.length; i++) {
            var acsry = accessories.accessories[i]
    
            for(var y=0; y < acsry.services[0].characteristics.length; y++) {
                var chrct = acsry.services[0].characteristics
                //
                if(chrct[y].value === accessory) {
    
                    //console.log("Found  the device, ", chrct[y].value)
                    //console.log("The object length is ", acsry.services[0].characteristics.length)

                    //if it's suppose to be looking for an iid number go into loop, else return found services (fServices)
                    if(iidStr) {
                        for(var x=0; x < acsry.services[1].characteristics.length; x++) {
        
                            if(acsry.services[1].characteristics[x].description == iidStr) {
                                var idObj = acsry.services[1].characteristics[x]
        
                                //console.log("AID: ", acsry.aid, "IID", idObj.iid)
                                fAid = acsry.aid
                                fIid = idObj.iid
                                fValue = idObj.value
                                fServices = acsry.services[1]
                                notFound = false
                                
                                if(value) {
                                    idObj.value = value;
                                }
                            }
                        }
                    } else {
                        fAid = acsry.aid
                        fServices = acsry.services[1]
                        notFound = false
                    }
                }
            }
        }
        if (notFound) {
            console.log("Accessory '%s' not found!", accessory)
        } else if (fAid && fIid && fValue && type == "post") {
            console.log("Found body is: aid = %s, id = %s, value = %s", fAid, fIid, fValue )

            //send values and update stored json with new value with callback 
            callback(fAid, fIid, fValue, function (getRSP) {
                getRSP = accessories;
            })
        } else if (fServices && fAid && type == "services") {
            callback(fAid, fServices)
        } else if (fAid && fIid && fValue && type == "value") {
            callback(fValue)
        }
    })
}


function accessoryDump (callback) {
    var dTnow = new Date().getTime();
    console.log("lastGetCall = ", lastGetCall)
    //if (!lastGetCall) {var lastGetCall = -1}

    console.log(dTnow, " - ", "90.000", " = ", dTnow-90000)
    console.log(dTnow, " - ", "90.000", " < ", lastGetCall, " = ", dTnow-90000 < lastGetCall)

    if(dTnow-90000 < lastGetCall && getRSP != undefined) {
        callback(getRSP)
    } else if (lastGetCall + 90000 < dTnow || lastGetCall == -1 || getRSP == undefined) {
        console.log("Last deviceDiscovery expired, getting new devices")
        lastGetCall = new Date().getTime()
        console.log("lastGetCall is now = ", lastGetCall)

        request({
            url:"http://192.168.1.171:51826/accessories",
            headers: {"Content-Type":"Application/json", "authorization": "589-00-356"}
        }, function (error, response, body) {
            //add response to client here
            getRSP = JSON.parse(body)
            callback(getRSP)
            //console.log(body)
        })
    } else {
        console.log(NaN);
    }
}


function servicesDump (type, aidStr, callback) {
    findDevice(type, aidStr, undefined, undefined, function (aid, services) {
        console.log (aid, services)
        callback({"aid": aid, "services": services})
    }) 
}

function valueDump (type, aidStr, IidStr, callback) {
    //reset stored config to force update
    //getRSP = undefined;
    findDevice(type, aidStr, IidStr, undefined, function (value) {
        console.log(value)
        callback(value)
    }) 
}
