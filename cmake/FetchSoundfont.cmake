include(FetchContent)

FetchContent_Declare(
    SoundFont
    URL "https://github.com/musescore/MuseScore/raw/refs/tags/v4.7.1/share/sound/MS%20Basic.sf3"
    URL_HASH SHA256=5EA2375E8BD7D8E71DEF1036978C1621E85B66934169B6A2744B27B9B3C2D99C
    DOWNLOAD_NAME "soundfont.sf3"
    DOWNLOAD_NO_EXTRACT ON
)
FetchContent_MakeAvailable(SoundFont)
set(3DMM_SOUNDFONT_PATH "${soundfont_SOURCE_DIR}/soundfont.sf3")
