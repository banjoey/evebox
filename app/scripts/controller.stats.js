'use strict';

(function() {

    var parseDuration = function(duration) {
        var match = duration.match(/(\d+)\s*(.*)/);
        var value = parseInt(match[1]);
        var unit = match[2];
        return moment.duration(value, unit);
    };

    angular.module("app").controller("CaptureStatsController",
        CaptureStatsController);

    function CaptureStatsController(ElasticSearch, $scope) {

        var vm = this;
        var parent = $scope.$parent.vm;

        var refresh = function() {

            ElasticSearch.search({
                query: {
                    filtered: {
                        filter: {
                            and: [
                                {
                                    exists: {field: "event_type"}
                                },
                                {
                                    term: {event_type: "stats"}
                                },
                                {
                                    range: {
                                        "@timestamp": {
                                            "gte": moment().subtract(parseDuration(parent.duration))
                                        }
                                    }
                                }
                            ]
                        }
                    }
                },
                size: 0,
                aggregations: {
                    totals: {
                        date_histogram: {
                            field: "@timestamp",
                            interval: parent.interval
                        },
                        aggregations: {
                            decoder_bytes: {
                                sum: {field: "stats.decoder.bytes_delta"}
                            }
                        }
                    }
                }
            }).then(function(response) {

                var decoderBytes = [];

                _.forEach(response.data.aggregations.totals.buckets,
                    function(bucket) {

                        var date = moment(bucket.key).toDate();
                        var delta = bucket.decoder_bytes.value;

                        decoderBytes.push({
                            date: date,
                            value: delta
                        });

                    });

                MG.data_graphic({
                    title: "Decoder Bytes (Deltas)",
                    full_width: true,
                    height: 300,
                    target: "#decoder-bytes-delta",
                    data: decoderBytes
                });

            });

        };

        $scope.$on('refresh', refresh);

        refresh();
    }

    angular.module("app").controller("StatsController", StatsController);

    function StatsController($scope, ElasticSearch) {

        var vm = this;

        vm.duration = "24h";
        vm.interval = "15m";

        vm.duration = '1h';
        vm.interval = '1m';

        ElasticSearch.search({
            query: {
                filtered: {
                    filter: {
                        and: [
                            {
                                exists: {field: "event_type"}
                            },
                            {
                                range: {
                                    "@timestamp": {
                                        "gte": moment().subtract(parseDuration(vm.duration))
                                    }
                                }
                            }
                        ]
                    }
                }
            },
            size: 0,
            aggregations: {
                sensors: {
                    terms: {
                        field: "sensor_name",
                        size: 0
                    }
                }
            }
        }).then(function(response) {
            console.log(response);
        });

        /**
         * Return histograms for each type of EVE record.
         */
        var refreshRecordTypeCounts = function(rangeFilter) {
            return ElasticSearch.search({
                query: {
                    filtered: {
                        filter: {
                            and: [
                                {
                                    exists: {field: "event_type"}
                                },
                                rangeFilter
                            ]
                        }
                    }

                },
                size: 0,
                aggregations: {
                    types: {
                        terms: {
                            field: "event_type",
                            size: 0
                        },
                        aggregations: {
                            counts: {
                                date_histogram: {
                                    field: "@timestamp",
                                    interval: vm.interval,
                                    min_doc_count: 0
                                }
                            }
                        }
                    }
                }
            }).then(function(response) {
                var data = {};

                _.forEach(response.data.aggregations.types.buckets,
                    function(bucket) {
                        var event_type = bucket.key;
                        data[event_type] = [];
                        _.forEach(bucket.counts.buckets, function(bucket) {
                            data[event_type].push({
                                date: moment(bucket.key).toDate(),
                                value: bucket.doc_count
                            });
                        })
                    });

                return data;
            });
        };

        var refresh = function() {

            $scope.$broadcast("refresh");

            var duration = parseDuration(vm.duration);

            var rangeFilter = {
                range: {
                    "@timestamp": {
                        "gte": moment().subtract(duration)
                    }
                }
            };

            refreshRecordTypeCounts(rangeFilter).then(function(counts) {

                for (var recordType in counts) {
                    var div = document.createElement("div");
                    div.setAttribute("id", recordType);
                    document.getElementById("counts-container").appendChild(div);

                    var data = counts[recordType];

                    MG.data_graphic({
                        title: recordType.toUpperCase(),
                        full_width: true,
                        height: 300,
                        target: "#" + recordType,
                        data: data,
                        chart_type: "histogram",
                        binned: true
                    });

                }

            });

        };

        vm.refresh = refresh;

        // Init.
        refresh();

    }
})();