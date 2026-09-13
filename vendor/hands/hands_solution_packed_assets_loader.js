
  var SmartSkipHandsPackedModule = typeof createSmartSkipHandsPackedAssets !== 'undefined' ? createSmartSkipHandsPackedAssets : {};

  if (!SmartSkipHandsPackedModule.expectedDataFileDownloads) {
    SmartSkipHandsPackedModule.expectedDataFileDownloads = 0;
  }

  SmartSkipHandsPackedModule.expectedDataFileDownloads++;
  (function() {
    // When running as a pthread, FS operations are proxied to the main thread, so we don't need to
    // fetch the .data bundle on the worker
    if (SmartSkipHandsPackedModule['ENVIRONMENT_IS_PTHREAD']) return;
    var loadPackage = function(metadata) {

      var PACKAGE_PATH = '';
      if (typeof window === 'object') {
        PACKAGE_PATH = window['encodeURIComponent'](window.location.pathname.toString().substring(0, window.location.pathname.toString().lastIndexOf('/')) + '/');
      } else if (typeof process === 'undefined' && typeof location !== 'undefined') {
        // web worker
        PACKAGE_PATH = encodeURIComponent(location.pathname.toString().substring(0, location.pathname.toString().lastIndexOf('/')) + '/');
      }
      var PACKAGE_NAME = 'blaze-out/k8-opt/genfiles/third_party/mediapipe/web/solutions/hands/hands_solution_packed_assets.data';
      var REMOTE_PACKAGE_BASE = 'hands_solution_packed_assets.data';
      if (typeof SmartSkipHandsPackedModule['locateFilePackage'] === 'function' && !SmartSkipHandsPackedModule['locateFile']) {
        SmartSkipHandsPackedModule['locateFile'] = SmartSkipHandsPackedModule['locateFilePackage'];
        err('warning: you defined SmartSkipHandsPackedModule.locateFilePackage, that has been renamed to SmartSkipHandsPackedModule.locateFile (using your locateFilePackage for now)');
      }
      var REMOTE_PACKAGE_NAME = SmartSkipHandsPackedModule['locateFile'] ? SmartSkipHandsPackedModule['locateFile'](REMOTE_PACKAGE_BASE, '') : REMOTE_PACKAGE_BASE;
var REMOTE_PACKAGE_SIZE = metadata['remote_package_size'];

      function fetchRemotePackage(packageName, packageSize, callback, errback) {
        if (typeof process === 'object' && typeof process.versions === 'object' && typeof process.versions.node === 'string') {
          require('fs').readFile(packageName, function(err, contents) {
            if (err) {
              errback(err);
            } else {
              callback(contents.buffer);
            }
          });
          return;
        }
        var xhr = new XMLHttpRequest();
        xhr.open('GET', packageName, true);
        xhr.responseType = 'arraybuffer';
        xhr.onprogress = function(event) {
          var url = packageName;
          var size = packageSize;
          if (event.total) size = event.total;
          if (event.loaded) {
            if (!xhr.addedTotal) {
              xhr.addedTotal = true;
              if (!SmartSkipHandsPackedModule.dataFileDownloads) SmartSkipHandsPackedModule.dataFileDownloads = {};
              SmartSkipHandsPackedModule.dataFileDownloads[url] = {
                loaded: event.loaded,
                total: size
              };
            } else {
              SmartSkipHandsPackedModule.dataFileDownloads[url].loaded = event.loaded;
            }
            var total = 0;
            var loaded = 0;
            var num = 0;
            for (var download in SmartSkipHandsPackedModule.dataFileDownloads) {
            var data = SmartSkipHandsPackedModule.dataFileDownloads[download];
              total += data.total;
              loaded += data.loaded;
              num++;
            }
            total = Math.ceil(total * SmartSkipHandsPackedModule.expectedDataFileDownloads/num);
            if (SmartSkipHandsPackedModule['setStatus']) SmartSkipHandsPackedModule['setStatus']('Downloading data... (' + loaded + '/' + total + ')');
          } else if (!SmartSkipHandsPackedModule.dataFileDownloads) {
            if (SmartSkipHandsPackedModule['setStatus']) SmartSkipHandsPackedModule['setStatus']('Downloading data...');
          }
        };
        xhr.onerror = function(event) {
          throw new Error("NetworkError for: " + packageName);
        }
        xhr.onload = function(event) {
          if (xhr.status == 200 || xhr.status == 304 || xhr.status == 206 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
            var packageData = xhr.response;
            callback(packageData);
          } else {
            throw new Error(xhr.statusText + " : " + xhr.responseURL);
          }
        };
        xhr.send(null);
      };

      function handleError(error) {
        console.error('package error:', error);
      };

      var fetchedCallback = null;
      var fetched = SmartSkipHandsPackedModule['getPreloadedPackage'] ? SmartSkipHandsPackedModule['getPreloadedPackage'](REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE) : null;

      if (!fetched) fetchRemotePackage(REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE, function(data) {
        if (fetchedCallback) {
          fetchedCallback(data);
          fetchedCallback = null;
        } else {
          fetched = data;
        }
      }, handleError);

    function runWithFS() {

      function assert(check, msg) {
        if (!check) throw msg + new Error().stack;
      }
SmartSkipHandsPackedModule['FS_createPath']("/", "third_party", true, true);
SmartSkipHandsPackedModule['FS_createPath']("/third_party", "mediapipe", true, true);
SmartSkipHandsPackedModule['FS_createPath']("/third_party/mediapipe", "modules", true, true);
SmartSkipHandsPackedModule['FS_createPath']("/third_party/mediapipe/modules", "hand_landmark", true, true);
SmartSkipHandsPackedModule['FS_createPath']("/third_party/mediapipe/modules", "palm_detection", true, true);

      /** @constructor */
      function DataRequest(start, end, audio) {
        this.start = start;
        this.end = end;
        this.audio = audio;
      }
      DataRequest.prototype = {
        requests: {},
        open: function(mode, name) {
          this.name = name;
          this.requests[name] = this;
          SmartSkipHandsPackedModule['addRunDependency']('fp ' + this.name);
        },
        send: function() {},
        onload: function() {
          var byteArray = this.byteArray.subarray(this.start, this.end);
          this.finish(byteArray);
        },
        finish: function(byteArray) {
          var that = this;
          
          SmartSkipHandsPackedModule['FS_createPreloadedFile'](this.name, null, byteArray, true, true, function() {
            SmartSkipHandsPackedModule['removeRunDependency']('fp ' + that.name);
          }, function() {
            if (that.audio) {
              SmartSkipHandsPackedModule['removeRunDependency']('fp ' + that.name); // workaround for chromium bug 124926 (still no audio with this, but at least we don't hang)
            } else {
              err('Preloading file ' + that.name + ' failed');
            }
          }, false, true); // canOwn this data in the filesystem, it is a slide into the heap that will never change

          this.requests[this.name] = null;
        }
      };

      var files = metadata['files'];
      for (var i = 0; i < files.length; ++i) {
        new DataRequest(files[i]['start'], files[i]['end'], files[i]['audio'] || 0).open('GET', files[i]['filename']);
      }

      function processPackageData(arrayBuffer) {
        assert(arrayBuffer, 'Loading data file failed.');
        assert(arrayBuffer.constructor.name === ArrayBuffer.name, 'bad input to processPackageData');
        var byteArray = new Uint8Array(arrayBuffer);
        var curr;
        // Reuse the bytearray from the XHR as the source for file reads.
          DataRequest.prototype.byteArray = byteArray;
          var files = metadata['files'];
          for (var i = 0; i < files.length; ++i) {
            DataRequest.prototype.requests[files[i].filename].onload();
          }          SmartSkipHandsPackedModule['removeRunDependency']('datafile_blaze-out/k8-opt/genfiles/third_party/mediapipe/web/solutions/hands/hands_solution_packed_assets.data');

      };
      SmartSkipHandsPackedModule['addRunDependency']('datafile_blaze-out/k8-opt/genfiles/third_party/mediapipe/web/solutions/hands/hands_solution_packed_assets.data');

      if (!SmartSkipHandsPackedModule.preloadResults) SmartSkipHandsPackedModule.preloadResults = {};

      SmartSkipHandsPackedModule.preloadResults[PACKAGE_NAME] = {fromCache: false};
      if (fetched) {
        processPackageData(fetched);
        fetched = null;
      } else {
        fetchedCallback = processPackageData;
      }

    }
    if (SmartSkipHandsPackedModule['calledRun']) {
      runWithFS();
    } else {
      if (!SmartSkipHandsPackedModule['preRun']) SmartSkipHandsPackedModule['preRun'] = [];
      SmartSkipHandsPackedModule["preRun"].push(runWithFS); // FS is not initialized yet, wait for it
    }

    }
    loadPackage({"files": [{"filename": "/third_party/mediapipe/modules/hand_landmark/handedness.txt", "start": 0, "end": 11}, {"filename": "/third_party/mediapipe/modules/palm_detection/palm_detection_full.tflite", "start": 11, "end": 2341291}, {"filename": "/third_party/mediapipe/modules/palm_detection/palm_detection_lite.tflite", "start": 2341291, "end": 4326731}], "remote_package_size": 4326731});

  })();
