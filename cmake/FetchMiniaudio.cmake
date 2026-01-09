include(FetchContent)

FetchContent_Declare(
    miniaudio
    URL https://github.com/mackron/miniaudio/archive/refs/tags/0.11.23.zip
    URL_HASH SHA256=96D032B8E77061C9E2C07FD524141B67F20FE99F86EC63243A3FD06EA7F93793
    DOWNLOAD_EXTRACT_TIMESTAMP ON
)

block()
    # Disable unused features
    set(MINIAUDIO_NO_FLAC ON)
    set(MINIAUDIO_NO_MP3 ON)
    set(MINIAUDIO_NO_LIBVORBIS ON)
    set(MINIAUDIO_NO_LIBOPUS ON)
    set(MINIAUDIO_NO_EXTRA_NODES ON)

    # Exclude from all so that we don't get miniaudio's static libraries in our install directory
    FetchContent_Populate(miniaudio)
    add_subdirectory(
        ${miniaudio_SOURCE_DIR}
        ${miniaudio_BINARY_DIR}
        EXCLUDE_FROM_ALL
    )
endblock()