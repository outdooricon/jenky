$(function() {
    var Job = Backbone.Model.extend({
        idAttribute: 'name',
        initialize: function() {
            this.set('displayName', this.displayName());
            this.on('change:name', function() {
                this.set('displayName', this.displayName());
            }, this);
            this.set('realDuration', this.realDuration());
        },
        displayName: function() {
            return this.get('name').replace(/_/g, ' ');
        },
        isBuilding: function() {
            return this.get('progress') && !this.get('result');
        },
        realDuration: function() {
            return Date.now() - this.get('timestamp');
        }
    });

    var JobsList = Backbone.Collection.extend({
        model: Job,
        url: window.jenky.conf.jenkins.url + '/api/json',
        parse: function(response) {
            return _.map(response.jobs, function(job) {
                return {
                    name: job.name,
                    color: job.color,
                    url: job.url
                };
            }, this);
        },
        sync: function(method, model, options) {
            if (method === "read") {
                $.ajax({
                    url: this.url,
                    dataType: 'jsonp',
                    jsonp: 'jsonp'
                }).then(_.bind(function(data) {
                    var jobs = this.parse(data);

                    return $.when.apply(window, _.map(jobs, function(job) {
                        return $.ajax({
                            url: job.url + '/lastBuild/api/json',
                            dataType: 'jsonp',
                            jsonp: 'jsonp'
                        }).then(function(details) {
                            return _.extend({}, job, details);
                        });
                    }, this));
                }, this)).then(_.bind(function() {
                    _.forEach(arguments, function(job) {
                        var name = job.name;
                        var existing = this.get(name);

                        if (_.isUndefined(existing)) {
                            this.add(job);
                        } else {
                            existing.set(job);
                        }
                    }, this);
                }, this));
            }
        }
    });

    var jobs = new JobsList();

    var JobView = Backbone.View.extend({
        tagName: "li",
        template: _.template($('#job-template').html()),
        initialize: function() {
            this.model.bind('change', this.render, this);
            this.model.bind('destroy', this.remove, this);
        },
        render: function() {
            this.$el.html(this.template(this.model.toJSON()));
            this.showProgress();
            return this;
        },
        showProgress: function() {
            var progressElement = this.$el.find('.progress');

            if (progressElement.length === 0)
                return;

            var main = progressElement.prev();

            var mainWidth = main.width();
            var progress = this.model.get('realDuration');
            var duration = this.model.get('estimatedDuration');
            var p = (progress / duration) * 100;

            console.log(progressElement.text(), {
                mainWidth: mainWidth,
                progress: progress,
                duration: duration,
                p: p,
                main: main
            });

            progressElement.css({
                display: 'block',
//                position: 'absolute',
//                top: main.position().top + 'px',
                width: '' + p + '%'
            });
        }
    });

    var JenkyView = Backbone.View.extend({
        el: $('#jobs'),
        initialize: function() {
            jobs.bind('add', this.addOne, this);
            jobs.bind('reset', this.addAll, this);
            jobs.bind('all', this.render, this);
            jobs.fetch();
        },
        render: function() {
        },
        addOne: function(job) {
            var view = new JobView({model: job});
            $(view.render().el).appendTo(this.$el);
        },
        addAll: function() {
            this.$el.empty();
            jobs.each(_.bind(this.addOne, this));
        },
        update: function() {
            jobs.fetch();
        }
    });

    var app = window.jenky.app = new JenkyView();

    window.setInterval(function() {
        app.update();
    }, jenky.conf.jenkins.updateInterval);

    var lastModified = {};

    window.setInterval(function() {
        _.each(['index.html', 'css/main.css', 'js/main.js'], function(file) {
            $.get(file, function(data, status, jqXHR) {
                var modified = jqXHR.getResponseHeader('Last-Modified');

                var last = lastModified[file];

                if (!_.isUndefined(last) && modified !== last)
                    location.reload();

                lastModified[file] = modified;
            }, 'text');
        });
    }, jenky.conf.jenky.updateInterval);
});