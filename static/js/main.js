var SQL_FROM_REGEX = /FROM\s+([^\s;]+)/mi;
var SQL_LIMIT_REGEX = /LIMIT\s+(\d+)(?:\s*,\s*(\d+))?/mi;
var SQL_SELECT_REGEX = /SELECT\s+[^;]+\s+FROM\s+/mi;

var db = null;
var rowCounts = [];
var editor = ace.edit("sql-editor");
var bottomBarDefaultPos = null, bottomBarDisplayStyle = null;
var errorBox = $("#error");
var lastCachedQueryCount = {};

$.urlParam = function(name){
    var results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(window.location.href);
    if (results==null){
        return null;
    }
    else{
        return results[1] || 0;
    }
};

var fileReaderOpts = {
    readAsDefault: "ArrayBuffer", on: {
        load: function (e, file) {
            loadDB(e.target.result);
        }
    }
};

var selectFormatter = function (item) {
    var index = item.text.indexOf("(");
    if (index > -1) {
        var name = item.text.substring(0, index);
        return name + '<span style="color:#ccc">' + item.text.substring(index - 1) + "</span>";
    } else {
        return item.text;
    }
};

var windowResize = function () {
    positionFooter();
    var container = $("#main-container");
    var cleft = container.offset().left + container.outerWidth();
    $("#bottom-bar").css("left", cleft);
};

var positionFooter = function () {
    var footer = $("#bottom-bar");
    var pager = footer.find("#pager");
    var container = $("#main-container");
    var containerHeight = container.height();
    var footerTop = ($(window).scrollTop()+$(window).height());

    if (bottomBarDefaultPos === null) {
        bottomBarDefaultPos = footer.css("position");
    }

    if (bottomBarDisplayStyle === null) {
        bottomBarDisplayStyle = pager.css("display");
    }

    if (footerTop > containerHeight) {
        footer.css({
            position: "static"
        });
        pager.css("display", "inline-block");
    } else {
        footer.css({
            position: bottomBarDefaultPos
        });
        pager.css("display", bottomBarDisplayStyle);
    }

    var tas = $("textarea");
    if(tas.length > 1) {
        tas[1].remove();
    }
};

var toggleFullScreen = function () {
    var container = $("#main-container");
    var resizerIcon = $("#resizer i");

    container.toggleClass('container container-fluid');
    resizerIcon.toggleClass('glyphicon-resize-full glyphicon-resize-small');
}
$('#resizer').click(toggleFullScreen);

if (typeof FileReader === "undefined") {
    $('#dropzone, #dropzone-dialog').hide();
    $('#compat-error').show();
} else {
    $('#dropzone, #dropzone-dialog').fileReaderJS(fileReaderOpts);
}

//Initialize editor
editor.setTheme("ace/theme/chrome");
editor.renderer.setShowGutter(false);
editor.renderer.setShowPrintMargin(false);
editor.renderer.setPadding(20);
editor.renderer.setScrollMargin(8, 8, 0, 0);
editor.setHighlightActiveLine(false);
editor.getSession().setUseWrapMode(true);
editor.getSession().setMode("ace/mode/sql");
editor.setOptions({ maxLines: 5 });
editor.setFontSize(16);

//Update pager position
$(window).resize(windowResize).scroll(positionFooter);
windowResize();

$(".no-propagate").on("click", function (el) { el.stopPropagation(); });

var topics;

$.getJSON('data/topics.json', function(data) {
    topics = data;
});

//Check url to load remote DB
var loadUrlDB = "data/catalogue.sqlite.db";
setIsLoading(true);
var xhr = new XMLHttpRequest();
xhr.open('GET', decodeURIComponent(loadUrlDB), true);
xhr.responseType = 'arraybuffer';

xhr.onload = function(e) {
	loadDB(this.response);
};
xhr.onerror = function (e) {
	setIsLoading(false);
};
xhr.send();

function loadDB(arrayBuffer) {
    setIsLoading(true);

    resetTableList();

    initSqlJs().then(function(SQL){
        var tables;
        try {
            db = new SQL.Database(new Uint8Array(arrayBuffer));

            //Get all table names from master table
            tables = db.prepare("SELECT * FROM sqlite_master WHERE type='table' OR type='view' ORDER BY name");
        } catch (ex) {
            setIsLoading(false);
            alert(ex);
            return;
        }

        var tableList = $("#tables");

        while (tables.step()) {
            var rowObj = tables.getAsObject();
            var name = rowObj.name;

            if(name.includes("sqlite")) {
                continue;
            }

            var rowCount = getTableRowsCount(name);
            rowCounts[name] = rowCount;
            tableList.append('<option value="' + name + '">' + name + ' (' + rowCount + ' items)</option>');
        }

		/*
		var tableButtons = $("#tableButtonContainer");

		tableObjects = [];
		while(tables.step()) {
			tableObjects.push(tables.getAsObject());
		}

		var firstTableName = tableObjects[0].name;

		tableObjects.forEach(
			rowObj => {
				rowCounts[rowObj.name] = getTableRowsCount(rowObj.name);
				tableButtons.append("<button type=\"button\" class=\"btn\" onclick=\"selectTable(\"" + rowObj.name + "\")>" + rowObj.name + "</button>");
			}
		);
		*/

		while(tables.step()) {
			var rowObj = tables.getAsObject();
			var name = rowObj.name;

			var rowCount = getTableRowsCount(name);
			rowCounts[name] = rowCount;
		}

        //Select first table and show It
        tableList.select2("val", "Books");
        doDefaultSelect("Books");

        $("#output-box").fadeIn();
        $(".nouploadinfo").hide();
        $("#sample-db-link").hide();
		$("#dropzone").delay(550).hide();
        $("#success-box").show();

        setIsLoading(false);
    });
}

function getTableRowsCount(name) {
    var sel = db.prepare("SELECT COUNT(*) AS count FROM '" + name + "'");
    if (sel.step()) {
        return sel.getAsObject().count;
    } else {
        return -1;
    }
}

function getQueryRowCount(query) {
    if (query === lastCachedQueryCount.select) {
        return lastCachedQueryCount.count;
    }

    var queryReplaced = query.replace(SQL_SELECT_REGEX, "SELECT COUNT(*) AS count_sv FROM ");

    if (queryReplaced !== query) {
        queryReplaced = queryReplaced.replace(SQL_LIMIT_REGEX, "");
        var sel = db.prepare(queryReplaced);
        if (sel.step()) {
            var count = sel.getAsObject().count_sv;

            lastCachedQueryCount.select = query;
            lastCachedQueryCount.count = count;

            return count;
        } else {
            return -1;
        }
    } else {
        return -1;
    }
}

function getTableColumnTypes(tableName) {
    var result = [];
    var sel = db.prepare("PRAGMA table_info('" + tableName + "')");

    while (sel.step()) {
        var obj = sel.getAsObject();
        result[obj.name] = obj.type;
        /*if (obj.notnull === 1) {
            result[obj.name] += " NOTNULL";
        }*/
    }

    return result;
}

function resetTableList() {
    var tables = $("#tables");
    rowCounts = [];
    tables.empty();
    tables.append("<option></option>");
    tables.select2({
        placeholder: "Select a table",
        formatSelection: selectFormatter,
        formatResult: selectFormatter
    });
    tables.on("change", function (e) {
        doDefaultSelect(e.val);
    });
}

function setIsLoading(isLoading) {
    var dropText = $("#drop-text");
    var loading = $("#drop-loading");
    if (isLoading) {
        dropText.hide();
        loading.show();
    } else {
        dropText.show();
        loading.hide();
    }
}

function extractFileNameWithoutExt(filename) {
    var dotIndex = filename.lastIndexOf(".");
    if (dotIndex > -1) {
        return filename.substr(0, dotIndex);
    } else {
        return filename;
    }
}

function dropzoneClick() {
    $("#dropzone-dialog").click();
}

function doDefaultSelect(name) {
    var defaultSelect = "SELECT * FROM '" + name + "' LIMIT 30";
    editor.setValue(defaultSelect, -1);
    renderQuery(defaultSelect);
}

function executeSql() {
    var query = editor.getValue();
    renderQuery(query);
    $("#tables").select2("val", getTableNameFromQuery(query));
}

function getTableNameFromQuery(query) {
    var sqlRegex = SQL_FROM_REGEX.exec(query);
    if (sqlRegex != null) {
        return sqlRegex[1].replace(/"|'/gi, "");
    } else {
        return null;
    }
}

function parseLimitFromQuery(query, tableName) {
    var sqlRegex = SQL_LIMIT_REGEX.exec(query);
    if (sqlRegex != null) {
        var result = {};

        if (sqlRegex.length > 2 && typeof sqlRegex[2] !== "undefined") {
            result.offset = parseInt(sqlRegex[1]);
            result.max = parseInt(sqlRegex[2]);
        } else {
            result.offset = 0;
            result.max = parseInt(sqlRegex[1]);
        }

        if (result.max == 0) {
            result.pages = 0;
            result.currentPage = 0;
            return result;
        }

        if (typeof tableName === "undefined") {
            tableName = getTableNameFromQuery(query);
        }

        var queryRowsCount = getQueryRowCount(query);
        if (queryRowsCount != -1) {
            result.pages = Math.ceil(queryRowsCount / result.max);
        }
        result.currentPage = Math.floor(result.offset / result.max) + 1;
        result.rowCount = queryRowsCount;

        return result;
    } else {
        return null;
    }
}

function setPage(el, next) {
    if ($(el).hasClass("disabled")) return;

    var query = editor.getValue();
    var limit = parseLimitFromQuery(query);

    var pageToSet;
    if (typeof next !== "undefined") {
        pageToSet = (next ? limit.currentPage : limit.currentPage - 2 );
    } else {
        var page = prompt("Go to page");
        if (!isNaN(page) && page >= 1 && page <= limit.pages) {
            pageToSet = page - 1;
        } else {
            return;
        }
    }

    var offset = (pageToSet * limit.max);
    editor.setValue(query.replace(SQL_LIMIT_REGEX, "LIMIT " + offset + "," + limit.max), -1);

    executeSql();
}

function refreshPagination(query, tableName) {
    var limit = parseLimitFromQuery(query, tableName);
    if (limit !== null && limit.pages > 0) {

        var pager = $("#pager");
        pager.attr("title", "Row count: " + limit.rowCount);
        pager.tooltip('fixTitle');
        pager.text(limit.currentPage + " / " + limit.pages);

        if (limit.currentPage <= 1) {
            $("#page-prev").addClass("disabled");
        } else {
            $("#page-prev").removeClass("disabled");
        }

        if ((limit.currentPage + 1) > limit.pages) {
            $("#page-next").addClass("disabled");
        } else {
            $("#page-next").removeClass("disabled");
        }

        $("#bottom-bar").show();
    } else {
        $("#bottom-bar").hide();
    }
}

function showError(msg) {
    $("#data").hide();
    $("#bottom-bar").hide();
    errorBox.show();
    errorBox.text(msg);
}

function htmlEncode(value){
  var out = $('<div/>').text(value).html();
  if(out == "null")
	return "";
  return out;
}

function renderQuery(query) {
    var dataBox = $("#data");
    var thead = dataBox.find("thead").find("tr");
    var tbody = dataBox.find("tbody");

    thead.empty();
    tbody.empty();
    errorBox.hide();
    dataBox.show();

    var columnTypes = [];
    var tableName = getTableNameFromQuery(query);
    if (tableName != null) {
        columnTypes = getTableColumnTypes(tableName);
		columnTypes = columnTypes.slice(0, -1);
    }

    var sel;
    try {
        sel = db.prepare(query);
    } catch (ex) {
        showError(ex);
        return;
    }

    var addedColums = false;
	var contentIndex = -1;
	var contentTypeIndex = -1;
    var topicIndex = -1;
    var ddcIndex = -1;
	var isbnColumns = [];
    while (sel.step()) {
        if (!addedColums) {
            addedColums = true;
            var columnNames = sel.getColumnNames();
			//columnNames = columnNames.slice(0, -1);
            for (var i = 0; i < columnNames.length; i++) {
				if(columnNames[i] == "Content") {
					contentIndex = i;
				} else if(columnNames[i] == "ContentType") {
					contentTypeIndex = i;
					continue;
                } else if(columnNames[i] == "Topic") {
                    topicIndex = i;
                } else if(columnNames[i] == "DDC") {
                    ddcIndex = i;
                } else if(columnNames[i].includes("ISBN")) {
					isbnColumns.push(i);
				}

                var type = columnTypes[columnNames[i]];
                thead.append('<th><span data-toggle="tooltip" data-placement="top">' + columnNames[i] + "</span></th>");
            }
        }

        var tr = $('<tr>');
        var s = sel.get();
		// Get this column's content type
		var contentType = s[contentTypeIndex];
		// Remove content type from visible columns
		//s = s.slice(0, contentTypeIndex) + s.slice(contentTypeIndex + 1, s.length);
		// Render data
		var isbn = null;
        for (var i = 0; i < s.length; i++) {
            var htmlEncodedContent = htmlEncode(s[i]);
            var isEmpty = isbn == null || isbn.length == 0;
			if(i == contentTypeIndex) {
				continue;
			} else if(isbnColumns.includes(i)) {
				tr.append('<td><span title="' + htmlEncodedContent + '"><a href=\"https://isbnsearch.org/isbn/' + htmlEncodedContent + '\" target=\"_blank\">' + htmlEncodedContent + '</a></span></td>');
                isbn = htmlEncodedContent;
            } else if(i == ddcIndex) {
                if(isEmpty) {
                    tr.append('<td><span title="Dewey Decimal Category">' + htmlEncodedContent + '</span></td>');
                } else {
                    tr.append('<td><span title="Dewey Decimal Category"><a href=\"http://classify.oclc.org/classify2/ClassifyDemo?search-standnum-txt=' + isbn + '\">' + htmlEncodedContent + '</a></span></td>');
                }
            } else if(i == topicIndex) {
                tr.append('<td><span title="' + topics[htmlEncodedContent] + '">' + htmlEncodedContent + '</span></td>');
            } else if(i == contentIndex && contentType != null) {
				// Render content
				switch(contentType) {
					case "url":
						tr.append("<td><span title=\"" + htmlEncodedContent.slice(5) + "\"><a href=\"" + htmlEncodedContent + "\" target=\"_blank\" download>View</a></span></td>");
						break;
					case "document":
						tr.append("<td><span title=\"" + htmlEncodedContent + "\"><a href=\"data/DocumentScans/" + htmlEncodedContent + "\" target=\"_blank\">Download</a></span></td>");
						break;
                    case "viewpdf":
                        tr.append("<td><span title=\"" + htmlEncodedContent + "\"><a href=\"#\" id=\"data/DocumentScans/" + htmlEncodedContent + "\" onclick=\"launchPDFModal(this.id)\">Quick Look</a></span></td>");
                        break;
					case "image":
						tr.append("<td><span title=\"" + htmlEncodedContent + "\"><a href=\"#\" id=\"data/DocumentScans/" + htmlEncodedContent + "\" onclick=\"launchImageModal(this.id)\">View</a></span></td>");
						break;
					case "audio":
						tr.append("<td><span title=\"" + htmlEncodedContent + "\"><a href=\"#\" id=\"data/AudioRips/" + htmlEncodedContent + "\" onclick=\"launchAudioModal(this.id)\">Listen</a></span></td>");
						break;
					case "video":
						tr.append("<td><span title=\"" + htmlEncodedContent + "\"><a href=\"#\" id=\"data/VideoRips/" + htmlEncodedContent + "\" onclick=\"launchVideoModal(this.id)\">Watch</a></span></td>");
						break;
					default:
						console.error("Content type " + contentType + " not supported");
                        tr.append("<td><span title=\"" + htmlEncodedContent + "\">" + htmlEncodedContent + "</span></td>");
						break;
				}
			} else {
            	tr.append('<td><span title="' + htmlEncodedContent + '">' + htmlEncodedContent + '</span></td>');
			}

			// Append content
			tbody.append(tr);
        }
    }

    refreshPagination(query, tableName);

    $('[data-toggle="tooltip"]').tooltip({html: true});
    dataBox.editableTableWidget();

    setTimeout(function () {
        positionFooter();
    }, 100);
}
