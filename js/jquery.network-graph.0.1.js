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
                    'default' : '<div class="network-node clearfix">' +
                                    '<img class="thumbnail" src="http://filmstore.bfi.org.uk/acatalog/[%image%]" />' +
                                 '</div>'
                    },
            showChildren    : true,
            initialNodeID   : '13728',
            jsonURL         : './json-data/[%id%].json', // would be nice to abstract this
            nodeId          : 'collab-node-id-',
            draggable       : true,     // is the collab map draggable ( requires jquery.ui.drggable )
            distanceNodes   : 220,      // distance between nodes
            distanceIncrement : 2,      // distance increment from parent node when node is selected
            moveTime        : 1000,     // animation time when a node is selected,
            angleLimit      : 180,
            returnToParent  : true,
            startAngle      : false,
            defaultImageReplace : false,
            defaultImageWatch : false,
            lineColour      : '#fff',
            variation       : 120,
            lineWidth       : 6,
            lineWidthSelected : 3,
            enableZoom		: false,
            className       : {
                    'node'      : 'lb-network-node',
                    'nodeHover' : 'lb-node-hover',
                    'trailing'  : 'lb-trailing-node'
            }, onSelectNode : function() {}
        };

    // Plugin constructor
    function LBNetworkGraph( element, options ) {
        this.element = element;

        this.dragged = false;
        this.getChildrenTimout = 0;

        this.$el = $(element);
        this.options = $.extend( {}, defaults, options) ;

        this._defaults = defaults;
        this._name = pluginName;

        this.currentNode = function() {
            return this.nodes.find('.collab-selected');
        }

        this.getStartNode = function() {
            return this.nodes.find('#' + this.options.nodeId + this.options.initialNodeID);
        }

        this.getJsonUrl = function() {
            return this.options.jsonURL;
        }

        this.setJsonUrl = function(url) {
            return this.options.jsonURL = url;
        }

        this.getChildren = function($node) {
            this._getChildren($node);
        }

        this.removeChildren = function($node) {
            this._removeChildren($node,true);
        }

        this.setStartAngle = function(angle) {
            this.options.startAngle = angle;
        }

        this.onChildrenSet = function() {
            // once children aer drawn
        }

        this.onCenterNode = function() {}

        this.init();
    }

    LBNetworkGraph.prototype = {

        raphael : window.Raphael,
        maxZoom : 2,
        zoomLevel : 0,
        minZoom : -2,
        zoomRatio : 2/3,
        rightClickTimer : 0,
        moz : ( $.browser.mozilla ),
        init : function () {

            // as the map is set so it can occupy a large area we
            // will hide the container's overflow
            this.$el.css({ overflow : 'hidden' });

            // this.map contains both other layers
            // this is the layer we drag around
            //
            this.map = $('<div class="collab-map" />')
                            .appendTo(this.$el)
                            .css({ height : '99999px', position : 'absolute', width : '99999px', 'transform-origin' : '0 0', '-webkit-transform-origin' : '0 0', '-moz-transform-origin' : '0 0' });


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

            if( this.options.enableZoom ) {
	            this.zoomIn = $('<div class="collab-map-zoom-in">+</div>')
	                                .appendTo(this.$el)
	                                .click((function(collabMap){ return function() {
	                                    collabMap.zoom('in');
	                                } })(this));

	            this.zoomOut = $('<div class="collab-map-zoom-out">-</div>')
	                                .appendTo(this.$el)
	                                .click((function(collabMap){ return function() {
	                                    collabMap.zoom('out');
	                                } })(this));
	        }


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
                this.options.draggable = true;
            }
            if ( this.options.draggable ) {
                var $collabMap = this;
                this.map.draggable({ opacity: 0.8,
                                     start : function() {
                                        $collabMap.dragged = true;
                                     },
                                     stop : function() {
                                        setTimeout(function() { $collabMap.dragged = false; }, 10);
                                      }
                                });

                // add classes to style the cursor adequately
                this.nodes.addClass('grab-cursor');

                this.nodes.mousedown(function() {
                    $(this).addClass('grabbing-cursor');
                });

                this.nodes.bind('mouseup mouseout', function() {
                    $(this).removeClass('grabbing-cursor')
                           .css({ cursor : 'default' })
                           .css({ cursor : '' });
                });
            }


            // add event listener to nodes
            this.nodes.on('mouseup', '.' + this.options.className.node,
                (function(collabMap) {
                    return function(e) {
                        if( !collabMap.dragged ) {
                            e.stopPropagation();
                            e.preventDefault();

                            var $this = $(this);

                            if( $this.hasClass('collab-selected') && $this.data('parent') && collabMap.options.returnToParent ) {
                                // if we're clicking on an already selected node go to its parent
                                collabMap.selectNode($this.data('parent'));
                                collabMap.centerToNode($this.data('parent'));
                            } else {
                                // else, select the node
                                collabMap.selectNode($this);
                                collabMap.centerToNode($this);
                            }
                        }
                    }
                })(this)
            );

            this.nodes.on('mouseover', '.' + this.options.className.node,
                (function(collabMap) {
                    return function(e) {
                        if ( collabMap.options.draggable ) {
                            collabMap.map.draggable('disable');
                        }
                    }
                })(this)
            );

            this.nodes.on('mouseout', '.' + this.options.className.node,
                (function(collabMap) {
                    return function(e) {
                        if ( collabMap.options.draggable ) {
                            collabMap.map.draggable('enable');
                        }
                    }
                })(this)
            );

            this.map.on('mouseover', '.' + this.options.className.node,
                (function(collabMap) {
                    return function(e) {
                        //e.stopPropagation();

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
        getNodeCoords : function(node) {
            // get the coords relative to the node's parent
            // we use data('coords') because this is the future position ( after animation )
            //
            var $nodeDimensions = node.find('.lb-node'),
            	scaleSize = this.scaleSize(),
            	position = node.data('coords');

        	position.left = position.left * scaleSize,
        	position.top = position.top * scaleSize;

            if( node.data('parent') ) {
                // add the parent's offset if it has one
                var parentPos = node.data('parent').offset();
                position.left += parentPos.left;
                position.top  += parentPos.top;
            } else {
                // always use offset for initial node
		        position = node.offset();
            }

            var mapPos = this.map.offset();

            var xCoord = mapPos.left - position.left;
            var yCoord = mapPos.top  - position.top;

            xCoord = (this.$el.outerWidth()/2)  + xCoord - ( ($nodeDimensions.outerWidth()/2)  + parseInt($nodeDimensions.css('margin-left')) ) * scaleSize;
            yCoord = (this.$el.outerHeight()/2) + yCoord - ( ($nodeDimensions.outerHeight()/2) + parseInt($nodeDimensions.css('margin-top')) ) * scaleSize;

            return { left : xCoord, top : yCoord };
        },
        centerToNode : function(node) {
        	var coords = this.getNodeCoords(node);
            this.mapToCoords(coords.left, coords.top);
        },
        /**
         * Select a specific node
         * {node} jQuery object for node
         *
         */
        selectNode : function($node) {
            // de-select previous selection
            //
            var $current = this.nodes.find('.collab-selected');

            // detrail this node
            this.deSelectNode($current);
            var $prevTrail = this.nodes.find('.' + this.options.className.trailing);

            // mark new node as seleced
            $node.addClass('collab-selected');

            if( $node.data('line') ) {
                $node.data('line').attr({ 'stroke-width' : this.options.lineWidthSelected });
            }

            // trail this node
            this._trailNode($node);

            // trail ancestors
            var parent = $node.data('parent');

            while( parent ) {
                this._trailNode(parent);
                parent = parent.data('parent');
            }

            // set the node at the new distance from the parent
            if( $node.data('parent') ) {
                var distToMove = (this.options.distanceNodes * this.options.distanceIncrement);
                this._distFromParent($node, distToMove);
            }

            var $collabMap = this;

            $prevTrail.each(function() {
                var $node = $(this);
                if( !$node.hasClass('lb-network-new-trail') )
                    $collabMap._deTrailNode($node);
            });

            // get the children for the selected node
            // after the animation has finished
            if( this.options.showChildren ) {
                clearTimeout(this.getChildrenTimout);
                this.getChildrenTimout = setTimeout(function() { $collabMap._getChildren($node) }, this.options.moveTime);
            }

            // remove new trail class from nodes
            this.nodes.find('.lb-network-new-trail').removeClass('lb-network-new-trail');

            this.options.onSelectNode();

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
            if( $node.data('line') ) $node.data('line').attr({ 'stroke-width' : this.options.lineWidthSelected });

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
                if( $node.data('line') ) $node.data('line').attr({ 'stroke-width' : this.options.lineWidth });

                // no timeout no worky :\ find out why!
                var $collabMap = this;

                    if( $node.data('parent') )
                        $collabMap._distFromParent($node, $node.data('distFromParent'));

                    $collabMap._removeChildren($node);

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

                    if( node.type && template.options.templates[node.type] )
                        templatetype = node.type;

                    // we wrap the nodes in a new div so that we can append the child nodes
                    // next to the node and let their encapsulation take care of them
                    // moving together around the screen without affecting the HTML or CSS
                    // for the node ( eg. overflow : hidden )
                    var newNode = $('<div></div>')
                                .append($(collabMap._replace(collabMap.options.templates[templatetype], node)).addClass('lb-node'))
                                .appendTo(collabMap.nodes)
                                .attr({ id : collabMap.options.nodeId + collabMap.options.initialNodeID })
                                .data('id', collabMap.options.initialNodeID)
                                .addClass(collabMap.options.className.node + ' collab-selected')
                                .css({ position : 'absolute' });

                    var centerScreen = collabMap._centerScreen();
                    var centerNode = collabMap._centerPos();

                    newNode.addClass(collabMap.options.className.trailing).css({ left : centerScreen[0] + 'px', top : centerScreen[1] + 'px' })
                           .data({ coords : { left : centerScreen[0], top : centerScreen[1] },
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
        _removeChildren : function($node, forced) {

            if( typeof(forced) == 'undefined' )
                forced = false;

            // do not remove them children while they're trailing
            if( !$node.hasClass(this.options.className.trailing) || forced ) {

                var nodeChildren = $node.find('.children-nodes .' + this.options.className.node);

                // fade the children out and remove them once they're out
                nodeChildren.each(function() {
                    var $this = $(this);
                    $this.data('line').remove();
                }).stop(true,true).animate({ opacity : 0 }, 500, function() { $(this).remove(); });
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
            if( $node.data('id') && (!$node.data('children') || !$node.data('children').length) ) {
                // if we have not grabbed the child nodes for this node before
                var url = this.options.jsonURL.replace(/\[\%id\%\]/gi, $node.data('id'));
                $.ajax({
                    url     : url,
                    dataType : 'json',
                    error   : function(res) {
                        //console.log(res)
                    },
                    success : ( function(collabMap) { return function(node) {
                        $node.data({ children : node.children });
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
            var children = $parent.data('children'),
            	childNum = children ? children.length : 0;

            if( !childNum ) return;

            var $container = $parent.find('.children-nodes');

            if( !$container.length )
                $container = $('<div class="children-nodes" />').appendTo($parent).css({ position : 'absolute', left : '50%', top : '50%' });

            var paper	  	= this.paper,
            	parentPos 	= $parent.data('coords'),
            	nodeId 	 	= this.options.nodeId,
            	angle   	= this.options.startAngle ? this.options.startAngle : Math.floor(Math.random()*360), // start angle for rotation
            	angleLimit	= $parent.data('parent') ? this.options.angleLimit : 360,	// this is the max angle the childnodes can cover
            	aInc 		= angleLimit/childNum, // angle between each element
            	templates 	= this.options.templates,
            	$collabMap 	= this,
            	parent 		= $parent,
            	parentPos 	= parent.position(),
            	scaleSize  = this.scaleSize();;

            if( $parent.data('parent') )
                angle = $parent.data('angleFromParent');

            if( childNum > 2 )
                angle -= Math.floor((aInc*(childNum-1))/2);
            else
                angle += (30-(Math.random()*60));

            while( parent.data('parent') ) {
                parent = parent.data('parent');
                var pos = parent.position();

                parentPos.left += pos.left;
                parentPos.top += pos.top;
            }

            parentPos.left = parentPos.left / scaleSize;
            parentPos.top = parentPos.top / scaleSize;

            var differentiation = this.options.variation,
            	varlk = Math.ceil(children.length/10)+2,
            	piFreq = Math.PI/2;

            $.each(children, function(i) {
                if( !$('#' + nodeId + $parent.data('id') + children[i].uid ).length ) {

                    var templatetype = ( children[i].type && templates[children[i].type] ) ? templatetype = children[i].type : 'default',
                    	TMPLT = templates[templatetype],
                    	$node = $('<div></div>')
                                .append($($collabMap._replace(TMPLT, children[i])).addClass('lb-node'))
                                .appendTo($container)
                                .addClass($collabMap.options.className.node)
                                .css({ position : 'absolute', opacity : 0 });

                    $node.attr({ id : nodeId + $parent.data('id') + children[i].uid })
                         .css({ left : 0, top : 0 });

                    var pathCoords = 'M' + parentPos.left + ' ' + parentPos.top + 'L' + parentPos.left + ' ' + parentPos.top;

                    var distanceFromParent = $collabMap.options.distanceNodes + (differentiation*Math.sin(piFreq*i));

                    $node.data({ parent : $parent,
                                 angleFromParent : angle,
                                 distFromParent : distanceFromParent,
                                 type : templatetype,
                                 lineColour :  children[i].lineColour || $collabMap.options.lineColour,
                                'id' : children[i].uid
                              });

                    if( $collabMap.raphael ) {
                        $node.data({ line :  $collabMap.paper.path(pathCoords) });
                        $node.data('line').attr({
                            'stroke-width' : $collabMap.options.lineWidth,
                            'stroke' : $node.data('lineColour')
                        });
                    }

                    $collabMap._distFromParent($node, distanceFromParent);

                    angle += aInc;
                }
            });

            if( this.options.defaultImageWatch && this.options.defaultImageReplace ) {
                var replacement = this.options.defaultImageReplace;
                $parent.find('.children-nodes ' + this.options.defaultImageWatch).error(function() {
                    $(this).attr('src', replacement);
                });
            }

            this.onChildrenSet();

        },
        /**
         * Vary the distance between a node and its parent
         * {$parent} jQuery object for node
         * {dist} distance between both
         *
         */
        _distFromParent : function($node, dist) {
            if( $node.data('parent') ) {

                var rad     = Math.PI/180,  // variable to convert angles to radians for trigonometry
                	childX  = childY = 0,
                	scaleSize  = this.scaleSize()
                	angle = $node.data('angleFromParent');

                if( typeof(dist) == 'undefined' )
                    dist    = this.options.distanceNodes * scaleSize;          // distance between nodes

                // since the nodes' heights and widths vary,
                // lets make the distance the same from the border of the node
                var node = $node.find('.lb-node');
                var nWidth  = node.outerWidth()/2;
                var nHeight = node.outerHeight()/2;

                // parent dimensions
                var parentDimension = $node.data('parent').find('.lb-node');
                var pWidth  = parentDimension.outerWidth()/2;
                var pHeight = parentDimension.outerHeight()/2;

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
                var nodeMoveEasing = $.easing['easeOutElastic'] ? 'easeOutBack' : 'linear';

                $node.data({ coords : { left : childX, top : childY } })
                     .stop(true, true)
                     .animate({ left : childX + 'px', opacity : 1, top : childY + 'px' }, this.options.moveTime, nodeMoveEasing);

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
                var parent 	   = $node.data('parent'),
                	parentPos  = parent.offset(),
                	mapPos	   = this.map.position(),
                	nodeCoords = $node.data('coords'),
                	scaleSize  = this.scaleSize();

                parentPos.left = ( parentPos.left - mapPos.left )  / scaleSize;
                parentPos.top  = ( parentPos.top - mapPos.top ) / scaleSize;

                nodeCoords.left = nodeCoords.left;
                nodeCoords.top = nodeCoords.top;

                var pathCoords = 'M' + parentPos.left + ' ' + parentPos.top +
                                 'L' + (parentPos.left + nodeCoords.left) + ' ' + (parentPos.top + nodeCoords.top);

                var lineDrawEasing = $.easing['easeOutElastic'] ? 'easeOut' : 'linear';

                if( this.raphael && $node.data('line') )
                    $node.data('line').animate({ path : pathCoords }, this.options.moveTime*0.5, lineDrawEasing);
            }

        },
        /**
         * Zoom in and out - by keeping the sizes in EM we can do this by
         * incrementing the font size of the container
         * {direction} string : 'in' or 'out'
         *
         */
        zoom : function(direction, coords) {
            var dir = this.zoomRatio;
            var zoom = true;

            if( typeof(direction) != 'undefined' && direction == 'in' ) {
                if( this.zoomLevel >= this.maxZoom )
                    zoom = false;
                else
                    this.zoomLevel++;

                dir = 1/dir;
            } else if( this.zoomLevel <= this.minZoom ) {
                zoom = false;
            } else {
                this.zoomLevel--;
            }

            if( zoom ) {
	            if( typeof coords == 'undefined' ) {
		            // grab the final coordinates of where we should end up
		            var centerX = ( this.map.position().left * dir ) + this.$el.width()/2,
		            	centerY = ( this.map.position().top  * dir ) + this.$el.height()/2;
	            }

	            // scale to fit
	            var coords  = this.map.offset(),
	            	xCoords = centerX - coords.left,
	            	yCoords = centerY - coords.top;

				this.map.transition({ x : xCoords, y : yCoords, scale : dir*this.scaleSize(), duration : 400,
							complete: function() {
								$(this).css({ left : centerX, top : centerY, x : 0, y : 0 });
							}
						});
            }


// for IE            this.nodes.animate({ zoom : 2 });
        },
        scale : function() {
            return ( this.moz ? 1 : (this.nodes.css('scale') || 1) );
        },
        scaleSize : function() {
            return this.map.css('scale');
        },
        mapToCoords : function(xCoord, yCoord) {
            // Lets move around at the same speed all the time instead
            // of speeding up if the distance travelled is longer
            var dx = Math.abs(xCoord - this.map.position().left);
            var dy = Math.abs(yCoord - this.map.position().top);

            var distanceToTravel = dy / ( Math.sin(Math.atan(dy/dx)) );
            // that's enough trigonometry for today

            speed = Math.min(Math.floor((distanceToTravel/260) * 600), 3000);

            var mapMoveEasing = $.easing['easeInOutQuint'] ? 'easeInOutQuint' : 'linear';
            var collabMap = this;

            this.map.stop(true, true).animate({ left : xCoord, top : yCoord },
                        speed, mapMoveEasing,
                        function() {
                            collabMap.onCenterNode();
                        });
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
        },
        /**
         * Get the coordinates of the position currently at the center of the map
         * returns { left : xCoord, top : yCoord }
         *
         */
        _currentCenterPos : function() {
            var offset = this.map.position();
			var left = offset.left + (this.$el.width()/2);
			var top = offset.top + (this.$el.height()/2);

            return { left : left, top : top };
        },
        _mouseCoords : function (event, currentElement) {
            var totalOffsetX = 0;
            var totalOffsetY = 0;
            var canvasX = 0;
            var canvasY = 0;

            var offset;

            while( currentElement && currentElement.closest('#network').length ) {
                offset = currentElement.position();
                totalOffsetX += offset.left;
                totalOffsetY += offset.top;

                currentElement = currentElement.parent();
            }

            canvasX = event.pageX - totalOffsetX;
            canvasY = event.pageY - totalOffsetY;

            return { x : canvasX, y : canvasY }
        }
    }

    $.fn[pluginName] = function ( options ) {
        return this.each(function () {
            if (!$.data(this, pluginName)) {
                $.data(this, pluginName,
                new LBNetworkGraph( this, options ));
            }
        });
    }

})( jQuery, window, document );