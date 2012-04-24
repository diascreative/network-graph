lbGMapLocation jQuery Network-Graph v.1
=================================
Copyright (c) 2011. Licensed under the MIT license.


Overview
========

A jQuery plugin that allows you to draw network graphs form JSON datasets
    - Depends on RaphaelJS to draw the canvas lines
    - Depends on JQueryUI for dragging and Easing animations
    - It does now break if either is missing

Usage
=====

$('#network-graph').lbNetworkGraph()

Templates
---------
any JSON fields you want to show need to be wrapped in [%%] in the template, as below
     '<h2>[%title%]</h2>'

This way you can add any fields you wish to to the JSON.
The only _required_ fields is the id for the child nodes - for now at least

JSON
----
JSON nodes look something like :
    {
        "title" : "Node title",
        "lineColour" : "#fff",
        "text" : "Descriptive text",
        "children" : [{
                        "id" : "child-node-id",
                        "title" : "Child node title",
                        "lineColour" : "#ff0",
                        "type" : "theme"
                    }]
   }