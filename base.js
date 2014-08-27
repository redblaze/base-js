var $C = function(namespace, namespaceName) {
    var removeFromArray = function(arr, e) {
        for (var i = 0; i < arr.length; i++) {
            if (e == arr[i]) {
                arr.splice(i, 1);
                return;
            }
        }
    };

    var randomSeed = function() {
        return Math.random() * 10000 + '';
    };

    var noStacking = function(fn) {
        var lock = 'stack_lock_' + randomSeed();
        return function() {
            if (this[lock]) {
                return;
            }
            this[lock] = 1;
            var val = fn.apply(this, arguments);
            this[lock] = 0;
            return val;
        }
    };

    var Class = function () {
        var extend = function (subclass, superclass, overrides) {
            var magic = function(fn) {
                return function() {
                    var tmp = this.parent;
                    this.parent = superclass.prototype;
                    var res = fn.apply(this, arguments);
                    this.parent = tmp;
                    return res;
                };
            };

            var k,
                TempClass = function () {};

            TempClass.prototype = superclass.prototype;
            subclass.prototype = new TempClass();

            for (k in overrides) {
                subclass.prototype[k] = magic(overrides[k]);
            }

            return superclass.prototype;
        };

        var Class = function () {
            var superclass, methods;

            if (arguments.length === 1) {
                methods = arguments[0];
            } else {
                superclass = arguments[0];
                methods = arguments[1];
            }

            var cls = function () {
                this._init.apply(this, arguments);
            };

            if (superclass) {
                extend(cls, superclass, methods);
            } else {
                cls.prototype = methods;
            }

            return cls;
        };

        return Class;
    }();

    var Event = Class({

        _init: function() {
            this._handlers = [];
            this._destroyHandlers = [];
        },

        addListener: function(fn) {
            this._handlers.push(fn);
        },

        removeListener: function(fn) {
            for (var i = 0; i < this._handlers.length; i++) {
                var handler = this._handlers[i];
                if (handler == fn) {
                    this._handlers.splice(i, 1);
                    return;
                }
            }
        },

        fire: function() {
            var handlers = [];

            for (var i = 0; i < this._handlers.length; i++) {
                handlers.push(this._handlers[i]);
            }

            for (var i = 0; i < handlers.length; i++) {
                var handler = handlers[i];
                handler.apply(this, arguments);
            }
        },

        onDestroy: function(fn){
            this._destroyHandlers.push(fn);
        },

        destroy: function() {
            this._handlers = [];

            for (var i = 0; i < this._destroyHandlers.length; i++) {
                var handler = this._destroyHandlers[i];
                handler.call(this);
            }
        }
    });


    var Attr = new Class({

        _init: function(v){
            this._value = v;
            this._followers = [];
            this._commanders = [];
            this._changeEvent = new Event();
            this._destroyEvent = new Event();
            this._lock = 0;
        },

        /* Synchronously sets the value of the attribute.  Prevents infinite
         loops by not propogating values to followers if the instance is
         already locked (already propogated the value).  Will not cause
         deadlock, but might cause inconsistent values if two commanders
         change nearly simultaneously, but that case probably doesn't
         occur very often.  Fires the change event after the value has
         been changed and all followers have been notified of the change. */

        set: function(v) {
            if (this._lock == 1) {return;}
            this._lock = 1;
            var oldV = this._value;
            this._value = v;

            for (var i = 0; i < this._followers.length; i++) {
                this._followers[i].set(v);
            }

            this._changeEvent.fire(v, oldV);
            this._lock = 0;
        },

        get: function() {
            return this._value;
        },

        /* Adding a listener to an attribute listens for when it is changed,
         or more specifically when it fires a changeEvent. */
        addListener: function(fn) {
            this._changeEvent.addListener(fn);
        },

        removeListener: function(fn) {
            this._changeEvent.removeListener(fn);
        },

        on: function(customEvent, fn) {
            customEvent.addListener(fn);
            this.onDestroy(function() {
                customEvent.removeListener(fn);
            });
        },

        /* Adds a follower if the follower is not already following
         this attribute. */
        command: function(follower) {
            for (var i = 0; i < this._followers.length; i++) {
                if (follower == this._followers[i]) {
                    return;
                }
            }
            this._followers.push(follower);
            follower._commanders.push(this);
        },

        /* Removes a follower from the followers of this attribute, and
         removes this attribute from the commanders of that follower. */
        uncommand: function(follower) {
            removeFromArray(this._followers, follower);
            removeFromArray(follower._commanders, this);
        },

        /* Synchronizes two attributes, meaning that when one attribute's
         value is changed, the other attribute's value is changed too. */
        sync: function(other) {
            this.command(other);
            other.command(this);
        },

        onDestroy: function(fn) {
            this._destroyEvent.addListener(fn);
        },

        /* Disconnect followers and commanders so that no calls will
         be made to destroyed objects. */
        destroy: function() {
            for (var i = 0; i < this._commanders.length; i++) {
                var commander = this._commanders[i];
                removeFromArray(commander._followers, this);
            }
            for (var j = 0; j < this._followers.length; j++) {
                var follower = this._followers[j];
                removeFromArray(follower._commanders, this);
            }
            this._changeEvent.destroy();
            this._commanders = [];
            this._followers = [];

            this._destroyEvent.fire();
            this._destroyEvent.destroy();
        },

        clear: function(){
            if (this._lock == 1) {return;}
            this._lock = 1;
            this._value = null;

            for (var i = 0; i < this._followers.length; i++) {
                this._followers[i].clear();
            }

            this._lock = 0;
        }
    });

    var Base = function() {
        var componentField = 'component_' + randomSeed();

        var cls = Class({
            _init: function() {
                this._destroyEvent = new Event();
                this[componentField] = {};
            },

            set: function(name, o) {
                var field = this[componentField];
                this[componentField][name] = o;

                if(o.onDestroy){
                    o.onDestroy(function(){
                        delete field[name];
                    });
                }
                return o;
            },

            get: function(name, strict) {
                strict = strict === undefined? true: strict;
                if (strict && this[componentField][name] === undefined) {
                    throw 'The component: ' + name + ' is undefined.';
                }
                return this[componentField][name];
            },

            has: function(name) {
                return !!this[componentField][name];
            },

            on: function(customEvent, fn) {
                var me = this;

                var removeCb = function() {
                    customEvent.removeListener(fn);
                    me._destroyEvent.removeListener(removeCb);
                };

                customEvent.addListener(fn);
                me.onDestroy(removeCb);
                return removeCb;
            },

            once: function(customEvent, fn) {
                var me = this,
                    cb = function() {
                        fn.apply(me, arguments);
                        removeCb();
                    };

                var removeCb = function() {
                    customEvent.removeListener(cb);
                    me._destroyEvent.removeListener(removeCb);
                };

                customEvent.addListener(cb);
                me.onDestroy(removeCb);
                return removeCb;
            },

            onDestroy: function(fn) {
                this._destroyEvent.addListener(fn);
            },

            // This function is final.  Do not override this function.
            destroy: noStacking(function() {
                for (var k in this[componentField]) {
                    this[componentField][k].destroy();
                }
                this._destroyEvent.fire();
                this._destroyEvent.destroy();
            })
        });

        return cls;
    }();

    var List = Class(Base, {
        _init: function() {
            Base.prototype._init.call(this);

            var me = this;
            this._items = [];
            this._destroyingAll = false;
            this.set('emptyEvt', new Event());
            this.onDestroy(function() {
                me.clear();
            });
        },

        add: function(item) {
            var me = this;
            this._items.push(item);
            item.onDestroy(function() {
                me._removeItemFromList(item);
            });
        },

        _removeItemFromList: function(item) {
            if (this._destroyingAll) {
                return;
            }
            for (var i = 0; i < this._items.length; i++) {
                var item0 = this._items[i];
                if (item0 == item) {
                    this._items.splice(i, 1);
                    if (this.size() === 0) {
                        this.get('emptyEvt').fire();
                    }
                    return;
                }
            }
        },

        size: function() {
            return this._items.length;
        },

        clear: function() {
            this._destroyingAll = true;
            for (var i = 0; i < this._items.length; i++) {
                this._items[i].destroy();
            }
            this._items = [];
            this._destroyingAll = false;
        },

        each: function(fn) {
            for(var i = 0; i < this._items.length; i++) {
                var item = this._items[i];
                fn(item, i);
            }
        },

        itemAt: function(i) {
            return this._items[i];
        },

        length: function() {
            return this._items.length;
        }
    });

    var Widget = Class(Base, {
        _init: function(node) {
            Base.prototype._init.call(this);

            this._node = node;
            this._uiLock = false;
        },

        render: function() {
            this._render();
            this._behavior();
        },

        _render: function() {
        },

        _behavior: function() {
        },

        _lockUi: function() {
            this._uiLock = true;
        },

        _unlockUi: function() {
            this._uiLock = false;
        },

        _isUiLocked: function() {
            return this._uiLock;
        }
    });

    var Progress = Class(Base, {
        _init: function() {
            this.parent._init.call(this);
            this._status = 'stopped'; // stopped | running
            this._instances = [];
        },
        /* Adds a callback/continuation (cont) for an animation/progression and an associated duration that the
         animation/progression should take to complete. */
        run: function(duration, cont) {
            var instance = {
                duration: duration,
                cont: cont,
                startTime: new Date()
            };
            this._instances.push(instance);
            if (this._status == 'stopped') {
                this._status = 'running';
                this._start();
            }
            return instance;
        },
        stop: function(instance) {
            instance.stopped = true;
        },
        /* Calls ._handleInstances after any other animations have finished, and only if Progress
         has not been stopped (.stop) before then. */
        _start: function() {
            var me = this;
            /* The setTimeout(fn, 0) pattern is a common way of putting the function on the event queue after everything else
             that is already on the event queue. This is usually intended to let other animations or UI events complete
             before starting a new one. */
            setTimeout(function() {
                me._handleInstances();
                if (me._instances.length > 0) {
                    me._start();
                } else {
                    me._status = 'stopped';
                }
            }, 0);
        },
        /* Removes stopped instances from the instance list (see ._cleanInstances),
         then handles each instance (see ._handleInstance). */
        _handleInstances: function() {
            this._cleanInstances();
            for (var i = 0; i < this._instances.length; i++) {
                var instance = this._instances[i];
                this._handleInstance(instance);
            }
        },
        /* Calls the instance with a single argument: the percent of time that has
         elapsed so far out of the total duration for the animation/progression. */
        _handleInstance: function(instance) {
            var currentTime = new Date();
            var progress = (currentTime - instance.startTime) / instance.duration;
            instance.cont(Math.min(progress, 1));
            if (progress >= 1) {
                this.stop(instance);
            }
        },
        /* Removes stopped instances from the instance list. */
        _cleanInstances: function() {
            var res = [];
            for (var i = 0; i < this._instances.length; i++) {
                var instance = this._instances[i];
                if (!instance.stopped) {
                    res.push(instance);
                }
            }
            this._instances = res;
        }
    });

    var Hash = Class(Base, {
        _init: function() {
            this.parent._init.call(this);
            this._ignoreHashChange = false;
            this._ignoreSetHash = false;

            this.set('changeEvent', new Event());
            this._behavior();
        },

        _behavior: function() {
            var me = this;

            $(window).bind('hashchange', function() {
                if (!me._ignoreHashChange) {
                    me._ignoreSetHash = true;
                    me.get('changeEvent').fire(me.getHash());
                    me._ignoreSetHash = false;
                } else {
                    me._ignoreHashChange = false;
                }
            });
        },

        setHash: function(hash) {
            if (!this._ignoreSetHash) {
                this._ignoreHashChange = this.getHash() !== hash;
                window.location.hash = hash;
            }
        },

        getHash: function() {
            return window.location.hash.substring(1);
        }
    });

    var Batch = Class({
        _init: function(cfg) {
            this._queue = [];
            this._remote = cfg['remote'];
        },

        _interpretQueue: function() {
            var requests = [];
            var cbs = [];

            for (var i = 0; i < this._queue.length; i++) {
                requests.push(this._queue[i]['request']);
                cbs.push(this._queue[i]['cb']);
            }

            this._queue = [];

            return {
                requests: requests,
                cbs: cbs
            };
        },

        handleRequestNow: function(request, cb) {
            var me = this;

            me._queue.push({
                request: request,
                cb: cb
            });

            me._sendRequests();
        },

        handleRequest: function(request, cb) {
            var me = this;

            if (me._queue.length == 0) {
                setTimeout(function() {
                    me._sendRequests();
                }, 0);
            }

            me._queue.push({
                request: request,
                cb: cb
            });
        },

        _applyErrorToCbs: function(cbs, err) {
            for (var i = 0; i < cbs.length; i++) {
                cbs[i](err);
            }
        },

        _applyDataToCbs: function(cbs, data) {
            for (var i = 0; i < cbs.length; i++) {
                if (data[i]['status'] == 'ok') {
                    cbs[i](null, data[i]['data']);
                } else { // data[i]['status'] == 'error'
                    cbs[i](data[i]['error']);
                }
            }
        },

        _sendRequests: function() {
            var me = this;

            var qRes = me._interpretQueue();
            var requests = qRes['requests'];
            var cbs = qRes['cbs'];

            me._remote(requests, function(err, res) {
                if (err) {
                    me._applyErrorToCbs(cbs, err);
                } else {
                    me._applyDataToCbs(cbs, res);
                }
            });
        }
    });

    var CachingUnit = Class({
        _init: function(proc) {
            this._proc = proc;
            this._status = 'start';
            this._cachedData = null;
            this._cbs = [];
        },

        _applyErrorToCbs: function(cbs, err) {
            var cbs = this._cbs;
            this._cbs = [];

            for (var i = 0; i < cbs.length; i++) {
                cbs[i](err);
            }
        },

        _applyResToCbs: function(cbs, res) {
            var cbs = this._cbs;
            this._cbs = [];

            for (var i = 0; i < cbs.length; i++) {
                cbs[i](null, res);
            }
        },

        _runProc: function() {
            var me = this;

            me._status = 'loading';

            me._proc(function(err, res) {
                if (err) {
                    me._status = 'error';
                    me._applyErrorToCbs(err);
                } else {
                    me._cachedData = res;
                    me._status = 'loaded';
                    me._applyResToCbs(res);
                }
            });
        },

        run: function(cb) {
            var me = this;

            switch(me._status) {
                case 'start':
                    me._cbs.push(cb);
                    me._runProc();
                    break;
                case 'loading':
                    me._cbs.push(cb);
                    break;
                case 'loaded':
                    cb(null, me._cachedData);
                    break;
                case 'error':
                    me._cbs.push(cb);
                    me._runProc();
                    break;
                default:
                    throw new Error('unrecognized status in Cache: ' + me._status);
            }
        }
    });

    var Cache = Class({
        _init: function(proc) {
            this._proc = proc;
            this._unit = new CachingUnit(proc);
        },

        dirty: function() {
            this._unit = new CachingUnit(this._proc);
        },

        run: function(cb) {
            this._unit.run(cb);
        }
    });

    var package = {
        'randomSeed': randomSeed,
        'noStacking': noStacking,
        'Class': Class,
        'Base': Base,
        'Event': Event,
        'Attr': Attr,
        'List': List,
        'Widget': Widget,
        'Batch': Batch,
        'Cache': Cache,
        'Progress': new Progress(),
        'Hash': new Hash()
    };

    (function() {
        var getOpenStr = function(name) {
            return [
                'var ', name, ' = ', namespaceName, '.', name, ';'
            ].join('');
        };

        var openStringAccumulator = [];
        for (var k in package) {
            namespace[k] = package[k];
            openStringAccumulator.push(getOpenStr(k));
        }

        namespace.System = openStringAccumulator.join('');
    })();

    (function() {
        var added = {};

        namespace.add = function(name, def) {
            /*
             if (added[name]) {
             return;
             }
             */

            def();

            added[name] = true;
        };
    })();
};
