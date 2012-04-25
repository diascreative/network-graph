/*!
 * jQuery Network-Graph
 * - Depends on RaphaelJS to draw the canvas lines
 * - Depends on JQueryUI for dragging and Easing animations
 * 
 * Templates - any JSON fields you want to show need
 * to be wrapped in [%%] in the template, as below
 *     '<h2>[%title%]</h2>'
 *
 *
 * This way you can add any fields you wish to the JSON.
 * The only _required_ fields are the .uid for the child nodes - for now at least
 *
 * JSON for nodes looks something like
 *    {
 *        "title" : "Node title",
 *        "lineColour" : "#fff",
 *        "text" : "Descriptive text",
 *        "children" : [{
 *                        "id" : "child-node-id",
 *                        "title" : "Child node title",
 *                        "lineColour" : "#ff0",
 *                        "type" : "theme"
 *                    }]
 *   }
 *
 * Original author: @large-blue
 * Licensed under the MIT license
 *
 */

;(function ( $, window, document, undefined ) {

    // Defaults
    var pluginName = 'lbNetworkGraph',
        defaults = {
            templates : {
                    'default' : '<div class="network-node">' +
                                    '<h2>[%title%]</h2>' +
                                    '<p>[%text%]</p>' +
                                 '</div>',
                    'theme' :  '<div class="network-node theme">' + // to use a different template add a .type field to the json object
                                    '<h2>[%title%]</h2>' +
                                 '</div>'
                    },
            initialNodeID   : '1',
            jsonURL         : './json/[%id%].json', // would be nice to abstract this
            nodeId          : 'collab-node-id-',
            draggable       : true,     // is the collab map draggable ( requires jquery.ui.drggable )
            distanceNodes   : 100,      // distance between nodes
            distanceIncrement : 4,      // distance increment from parent node when node is selected
            moveTime        : 1000,     // animation time when a node is selected,
            angleLimit      : 180,
            className       : {
                    'node'      : 'lb-network-node',
                    'nodeHover' : 'lb-node-hover',
                    'trailing'  : 'lb-trailing-node'
            }
        };

    // Plugin constructor
    function LBNetworkGraph( element, options ) {
        this.element = element;

        this.$el = $(element);
        this.options = $.extend( {}, defaults, options) ;

        this._defaults = defaults;
        this._name = pluginName;

        this.init();
    }

    LBNetworkGraph.prototype = {
        raphael : window.Raphael,
        init : function () {

            // as the map is set so it can occupy a large area we
            // will hide the container's overflow
            this.$el.css({ overflow : 'hidden' });
            
            // this.map contains both other layers
            // this is the layer we drag around
            //
            this.map = $('<div class="collab-map" />')
                            .appendTo(this.$el)
                            .css({ height : '9999px', position : 'absolute', width : '9999px' });


            var raphaelRandomID = 'raphael-rnd-num-' + ( Math.floor(Math.random()*10000000) ); // each canvas requires a unique ID

            // this.lines is the layer which contains
            // the raphael canvas to which we draw the SVG lines
            //
            this.lines = $('<div id="' + raphaelRandomID + '" class="collab-lines" />')
                                .appendTo(this.map)
                                .css({ height : '100%', top : '0', left : '0', position : 'absolute' , width : '100%' });

            
            // initiate canvas
            this.initiateCanvas(raphaelRandomID);

            // this.nodes is the layer to which
            // we will append all our nodes HTML
            //
            this.nodes = $('<div class="collab-node-parent" />')
                                .appendTo(this.map)
                                .css({ height : '100%', top : '0', left : '0', position : 'absolute' , width : '100%' });


            // controls
            //
            this.zoomIn = $('<div class="collab-map-zoom-in">+</div>')
                                .appendTo(this.$el)
                                .click((function(collabMap){ return function(){
                                    collabMap.zoom('in');
                                } })(this));

            this.zoomOut = $('<div class="collab-map-zoom-out">-</div>')
                                .appendTo(this.$el)
                                .click((function(collabMap){ return function(){
                                    collabMap.zoom('out');
                                } })(this));


            // we want to start with a centered map
            //
            var center = this._centerPos();
            var centerScreen = this._centerScreen();

            this.map.css({ left : -center[0] + 'px', top : -center[1] + 'px' });


            // If we allow dragging and have the jquery.ui.draggable
            // allow us to drag
            //
            if ( this.options.draggable &&
                 typeof(window.$.ui) != 'undefined' &&
                 typeof(window.$.ui.draggable) != 'undefined' ) {
                 

                this.map.draggable();

                // add classes to style the cursor adequately
                this.nodes.addClass('grab-cursor');

                this.nodes.mousedown(function() {
                    $(this).addClass('grabbing-cursor');
                });

                this.nodes.mouseup(function() {
                    $(this).removeClass('grabbing-cursor');
                });
            }


            // add event listener to nodes
            this.map.on('click', '.' + this.options.className.node,
                (function(collabMap) {
                    return function(e) {
                        e.stopPropagation();
        
                        var $this = $(this);
        
                        if( $this.hasClass('collab-selected') && $this.data('parent') ) {
                            // if we're clicking on an already selected node go to its parent
                            collabMap.selectNode($this.data('parent'));
                            collabMap.centerToNode($this.data('parent'));
                        } else {
                            // else, select the node
                            collabMap.selectNode($this);
                            collabMap.centerToNode($this);
                        }
                    }
                })(this)
            );

            this.map.on('mouseover', '.' + this.options.className.node,
                (function(collabMap) {
                    return function(e) {
                        e.stopPropagation();

                        collabMap.nodes.find('.' + collabMap.options.className.nodeHover).removeClass(collabMap.options.className.nodeHover);
                        $(this).addClass(collabMap.options.className.nodeHover);
                    }
                })(this)
            );

            // add our initial node
            this._addInitialNode();

        },
        /**
         * Initiatest the canvas element : right now it's using RaphaelJS
         * {string} canvas id to draw on
         * 
         */
        initiateCanvas : function(canvasID) {
            // init the canvas
            if( this.raphael )
                this.paper = Raphael(canvasID, this.map.height(), this.map.width());
        },
        /**
         * Centers the map to a specific node
         * {node} jQuery object for node
         * 
         */
        centerToNode : function(node) {
            // get the coords relative to the node's parent
            // we use data('coords') because this is the future position ( after animation )
            //
            var position = node.data('coords');

            if( node.data('parent') ) {
                // add the parent's offset if it has one
                var parentPos = node.data('parent').offset();
                position.left += parentPos.left;
                position.top += parentPos.top;
            } else {
                // always use offset for initial node
                position = node.offset();
            }

            var mapPos = this.map.offset();

            var xCoord = mapPos.left - position.left;
            var yCoord = mapPos.top - position.top;

            xCoord = this.$el.outerWidth()/2 + xCoord - (node.outerWidth()/2);
            yCoord = this.$el.outerHeight()/2 + yCoord - (node.outerHeight()/2);

            // Lets move around at the same speed all the time instead
            // of speeding up if the distance travelled is longer
            var dx = Math.abs(xCoord - this.map.position().left);
            var dy = Math.abs(yCoord - this.map.position().top);


            var distanceToTravel = dy / ( Math.sin(Math.atan(dy/dx)) );
            // that's enough trigonometry for today

            var speed = Math.floor((distanceToTravel/260) * 600);

            var mapMoveEasing = $.easing['easeInOutQuint'] ? 'easeInOutQuint' : 'linear';

            this.map.stop(true, true).animate({ left : xCoord, top : yCoord },
                        speed, mapMoveEasing);
        },
        /**
         * Select a specific node
         * {node} jQuery object for node
         * 
         */
        selectNode : function($node) {
            // de-select previous selection
            //
            var $current = this.nodes.find('.collab-selected').removeClass('collab-selected');

            // detrail this node
            this.deSelectNode($current);
            this._deTrailNode($current);

            // mark new node as seleced
            $node.addClass('collab-selected');

            if( $node.data('line') ) {
                $node.data('line').attr({ 'stroke-width' : 3 });
            }
            
            // trail this node
            this._trailNode($node);

            // trail ancestors
            parent = $node.data('parent');

            while( parent ) {
                this._trailNode(parent);
                parent = parent.data('parent');
            }

            // de-trail ancestors of the previous selected node
            var parent = $current.data('parent');
            while( parent ) {
                this._deTrailNode(parent);
                parent = parent.data('parent');
            }

            // set the node at the new distance from the parent
            this._distFromParent($node, (this.options.distanceNodes * this.options.distanceIncrement));

            // get the children for the selected node
            // after the animation has finished
            var $collabMap = this;
            setTimeout(function() { $collabMap._getChildren($node) }, this.options.moveTime);

            // remove new trail class from nodes
            this.nodes.find('.lb-network-new-trail').removeClass('lb-network-new-trail');

        },
        /**
         * de-select a node
         * {$node} jQuery object for node
         * 
         */
        deSelectNode : function($node) {
            // de select a node
            //
            $node.removeClass('collab-selected');

        },
        /**
         * trail a node - it's part of the trail we've travelled
         * {$node} jQuery object for node
         * 
         */
        _trailNode : function($node) {
            // the "lb-network-new-trail" class allows us to keep already trailed nodes
            // when they are part of the new current trail, without detrailing them
            $node.addClass(this.options.className.trailing + ' lb-network-new-trail');

            // trail node's line width
            if( $node.data('line') ) $node.data('line').attr({ 'stroke-width' : 3 });

        },
        /**
         * de-trail a node - check node and detrail it if necessary
         * {$node} jQuery object for node
         * 
         */
        _deTrailNode : function($node) {

            if( !$node.hasClass('lb-network-new-trail') ) {
                // we don't want to de-trail any newly trailed nodes
                $node.removeClass(this.options.className.trailing);

                // return line width to its original glory
                if( $node.data('line') ) $node.data('line').attr({ 'stroke-width' : 6 });

                // no timeout no worky :\ find out why!
                var $collabMap = this;
                setTimeout(function(){ $collabMap._removeChildren($node) }, 10)
            } else {
                // we've alerady tried to detrail once
                $node.removeClass('lb-network-new-trail');
            }
        },
        /**
         * Add our initial node
         * {id} ( in the future ) add the id of the node we want to stat off with
         * 
         */
        _addInitialNode : function() {
            // grab the template it requires
            var template = this;
            
            var url = this.options.jsonURL.replace(/\[\%id\%\]/gi, this.options.initialNodeID);

            $.ajax({
                url     : url,
                dataType : 'json',
                error   : function(res) {
                    //console.log(res)
                },
                success : ( function(collabMap) { return function(node) {
                    var templatetype = 'default';
              
                    if( node.type && this.options.templates[node.type] )
                        templatetype = node.type;
        
                    var newNode = $(collabMap._replace(collabMap.options.templates[templatetype], node))
                                .appendTo(collabMap.nodes)
                                .attr({ id : collabMap.options.nodeId + collabMap.options.initialNodeID })
                                .addClass(collabMap.options.className.node);
        
                    var centerScreen = collabMap._centerScreen();
                    var centerNode = collabMap._centerPos();
        
                    newNode.addClass(collabMap.options.className.trailing).css({ left : centerScreen[0] + 'px', top : centerScreen[1] + 'px' })
                           .data({ coords : { left : centerNode[0], top : centerNode[1] },
                                   children : node.children || [] });
        
                    collabMap._getChildren(newNode);
                }})(this)
            });
        },
        /**
         * Remove child nodes
         * {$node} node to lose its children
         * 
         */
        _removeChildren : function($node) {
            // do not remove them children whil they're trailing
            if( !$node.hasClass(this.options.className.trailing) ) {
                this._distFromParent($node, this.options.distanceNodes);

                var nodeChildren = $node.find('.' + this.options.className.node);
                // fade the children out and remove them once they're out    
                nodeChildren.each(function() {
                    $(this).data('line').remove();
                });

                // fade the children out and remove them once they're out
                $node.find('.children-nodes').animate({ opacity : 0 }, 500, function() { $(this).remove() });
            }
        },
        _replace : function(TMPLT, data) {
            var newReg = new RegExp('\\[.*?\\]')
            var match = TMPLT.match(newReg);

            var j = 10;
            while( match && j-- ) {
                var replacement = match[0].replace(/\[/, '').replace(/\%/g, '').replace(/\]/, '');
                replacement = data[replacement] || '';

                TMPLT = TMPLT.replace(match, replacement);
                match = TMPLT.match(newReg)

            }            
            return TMPLT;
        },
        /**
         * Get node's children
         * {$node} jQuery object for node
         * 
         */
        _getChildren : function($node) {
            if( !$node.data('children') ) {
                // if we have not grabbed the child nodes for this node before
                var url = this.options.jsonURL.replace(/\[\%id\%\]/gi, $node.data('id'));

                $.ajax({
                    url     : url,
                    dataType : 'json',
                    error   : function(res) {
                        //console.log(res)
                    },
                    success : ( function(collabMap) { return function(node) {
                        $node.data({ children : node.children })
                        // once we have the children, set them 
                        collabMap._setChildren($node);
                    }})(this)
                })
            } else {
                // set the children
                this._setChildren($node);
            }
        },
        /**
         * Draw node's children
         * {$parent} jQuery object for node
         * 
         */
        _setChildren : function($parent) {
            var children = $parent.data('children');

            var childNum = children.length;

            var $container = $('<div class="children-nodes" />').appendTo($parent).css({ position : 'absolute', left : '50%', top : '50%' });
            var paper      = this.paper;

            var parentPos = $parent.position();
            var nodeId = this.options.nodeId;

            var angle   = Math.floor(Math.random()*360); // start angle for rotation

            if( $parent.data('parent') ) {
                childNum++;
            }

            var angleLimit = $parent.data('parent') ? this.options.angleLimit : 360;
            var aInc = angleLimit/childNum; // angle between each element

            if( $parent.data('parent') ) {
                angle = $parent.data('angleFromParent') + aInc - ( this.options.angleLimit / 2 );
            }

            var templates = this.options.templates;

            var $collabMap = this;

            $.each(children, function(i) {
                if( !$('#' + nodeId + children[i].uid ).length ) {
                    var templatetype = 'default';
                    
                    if( children[i].type && templates[children[i].type] )
                        templatetype = children[i].type;
        
                    var TMPLT = templates[templatetype];

                    var $node = $($collabMap._replace(TMPLT, children[i]))
                                .appendTo($container)
                                .addClass($collabMap.options.className.node);

                    $node.attr({ id : nodeId + children[i].uid })
                         .css({ left : 0, top : 0 });

                    var parent = $parent;
                    parentPos = $parent.position();

                    while( parent.data('parent') ) {
                        parent = parent.data('parent');
                        var pos = parent.position();
                        parentPos.left += pos.left;
                        parentPos.top += pos.top;
                    }

                    var pathCoords = 'M' + parentPos.left + ' ' + parentPos.top + 'L' + parentPos.left + ' ' + parentPos.top;

                    $node.data({ parent : $parent,
                                 angleFromParent : angle,
                                 lineColour :  children[i].lineColour || '#fff',
                                'id' : children[i].uid
                              });

                    if( $collabMap.raphael ) {
                        $node.data({ line :  $collabMap.paper.path(pathCoords) });
                        $node.data('line').attr({
                            'stroke-width' : 6,
                            'stroke' : $node.data('lineColour')
                        });
                    }

                    $collabMap._distFromParent($node);

                    angle += aInc;
                }
            });

        },
        /**
         * Vary the distance between a node and its parent
         * {$parent} jQuery object for node
         * {dist} distance between both
         * 
         */
        _distFromParent : function($node, dist) {
            if( $node.data('parent') ) {
            
                if( typeof(dist) == 'undefined' )
                    dist    = this.options.distanceNodes;          // distance between nodes

                var rad     = Math.PI/180;  // variable to convert angles to radians for trigonometry
                var childX = childY = 0;

                var angle = $node.data('angleFromParent');

                // since the nodes' heights and widths vary,
                // lets make the distance the same from the border of the node
                var nWidth  = $node.outerWidth()/2;
                var nHeight = $node.outerHeight()/2;

                // parent dimensions                
                var pWidth = $node.data('parent').outerWidth()/2;
                var pHeight = $node.data('parent').outerHeight()/2;

                var extraD  = 0;
                
                var nAngle = Math.atan(nWidth/nHeight); // this is the angle at which we'll find a corner in the node
                    nAngle = Math.round(nAngle * 180/Math.PI);

                var pAngle = Math.atan(pWidth/pHeight); // this is the angle at which we'll find a corner in the parent
                    pAngle = Math.round(pAngle * 180/Math.PI);

                var minAngle = angle;

                if( minAngle > 360 ) {
                    // fix up angles so they can't be bigger than 360
                    minAngle = minAngle%360;
                } else if( minAngle < 0 ) {
                    // nor smaller than 0
                    // - minimizing the angle we work with just magically solves problems
                    minAngle = 360 + minAngle;
                }

                if( minAngle > 270 ) {
                    minAngle = 360 - minAngle;
                } else if( minAngle > 180 ) {
                    minAngle = minAngle - 180;
                } else if( minAngle > 90 ) {
                    minAngle = 180 - minAngle;
                }

                // lines travel from center of the node to center of node
                // hence part of the line is hidden behind the nodes
                // to make our distance in options be from border to border we must
                // calculate the distance the line travels within the nodes and add
                // it to the defined distance

                // find the distance of the line behind the node
                if( minAngle < nAngle ) {
                    extraD = nHeight / Math.cos(minAngle*rad);
                } else {
                    extraD = nWidth / Math.sin(minAngle*rad);
                }

                // find the distance of the line behind the parent node
                if( minAngle < pAngle ) {
                    extraD += pHeight / Math.cos(minAngle*rad);
                } else {
                    extraD += pWidth / Math.sin(minAngle*rad);
                }

                var nodeDist = dist + extraD;

                // get our coordinates for the node
                childX = parseInt(nodeDist * Math.sin(angle * rad));
                childY = parseInt(nodeDist * Math.cos(angle * rad));

                // store the new coords so we can access them easily
                // animate the movement of the node to the new coords
                var nodeMoveEasing = $.easing['easeOutElastic'] ? 'easeOutElastic' : 'linear';

                $node.data({ coords : { left : childX, top : childY } })
                     .animate({ left : childX + 'px', top : childY + 'px' }, this.options.moveTime, nodeMoveEasing);

                // draw the line to the parent as we animate
                this._drawLineToParent($node)
            }
        },
        /**
         * Draw the line from a node to its parent
         * {$node} jQuery object for node
         * 
         */
        _drawLineToParent : function($node) {
            if( $node.data('parent') ) {
                var parent = $node.data('parent');
                var parentPos = parent.position();
                
                while( parent.data('parent') ) {
                    parent = parent.data('parent');
                    var pos = parent.position();
                    parentPos.left += pos.left;
                    parentPos.top += pos.top;
                }

                var pathCoords = 'M' + parentPos.left + ' ' + parentPos.top +
                                 'L' + (parentPos.left + $node.data('coords').left) + ' ' + (parentPos.top + $node.data('coords').top);

                var lineDrawEasing = $.easing['easeOutElastic'] ? 'elastic' : 'linear';

                if( this.raphael )
                    $node.data('line').animate({ path : pathCoords }, this.options.moveTime, lineDrawEasing);
            }
            
        },
        /**
         * Zoom in and out - by keeping the sizes in EM we can do this by 
         * incrementing the font size of the container
         * {direction} string : 'in' or 'out'
         * 
         */
        zoom : function(direction) {
            var fontSize = parseFloat(this.$el.css('font-size'));
            var dir = 2/3;

            if( typeof(direction) != 'undefined' && direction == 'in' )
                dir = 1.5;
            
            this.$el.css({ fontSize : fontSize * dir + 'px'})
        },
        /**
         * Get the center coords of the map
         * returns [xcoord, ycoord]
         * 
         */
        _centerPos : function() {
            var centerY = (this.map.height()/2);
            var centerX = (this.map.width()/2);
            return [centerX, centerY];
        },
        /**
         * Get the left, top position of the map so that its center
         * is at the center of the container
         * returns [left, top]
         * 
         */
        _centerScreen : function() {
            var top = (this.map.height()/2) + (this.$el.height()/2);
            var left = (this.map.width()/2) + (this.$el.width()/2);
            return [left, top];
        }
    }

    $.fn[pluginName] = function ( options ) {
        return this.each(function () {
            if (!$.data(this, 'plugin_' + pluginName)) {
                $.data(this, 'plugin_' + pluginName,
                new LBNetworkGraph( this, options ));
            }
        });
    }

})( jQuery, window, document );