function BeatmapSetEntry(fileEntrys, callback) {
    this.beatmapEntrys = {};
    this.loadingMaps = 0;
    this.beatmapSetID = -1;

    for(var fileEntry in fileEntrys) {
        if(fileEntrys[fileEntry].name.endsWith(".osu")) {
            this.loadingMaps++;
            fileEntrys[fileEntry].file((function(file) {
                FileUtil.loadFileAsString(file, (function(content) {
                    var beatmap = new BeatmapEntry(content.target.result)

                    if(this.beatmapSetID == -1 && beatmap.beatmapSetID != undefined) {
                        this.beatmapSetID = beatmap.beatmapSetID;
                    }

                    this.beatmapEntrys[beatmap.beatmapID] = beatmap;

                    this.loadingMaps--;
                    if(this.loadingMaps == 0) callback();
                }).bind(this));
            }).bind(this));
        }
    }
}