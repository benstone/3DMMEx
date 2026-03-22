include(FetchContent)

if (MSVC)
    if (CMAKE_SIZEOF_VOID_P EQUAL 8)
        set(fluidsynth_url "https://github.com/FluidSynth/fluidsynth/releases/download/v2.5.2/fluidsynth-v2.5.2-win10-x64-cpp11.zip")
    elseif (CMAKE_SIZEOF_VOID_P EQUAL 4)
        set(fluidsynth_url "https://github.com/FluidSynth/fluidsynth/releases/download/v2.5.2/fluidsynth-v2.5.2-win10-x86-cpp11.zip")
    endif()

    FetchContent_Declare(
        FluidSynth
        URL ${fluidsynth_url}
        DOWNLOAD_EXTRACT_TIMESTAMP ON
    )
    FetchContent_MakeAvailable(FluidSynth)
    set(FluidSynth_ROOT "${fluidsynth_SOURCE_DIR}")

    FetchContent_Declare(
        SoundFont
        URL "https://github.com/musescore/MuseScore/raw/refs/heads/master/share/sound/MS%20Basic.sf3"
        DOWNLOAD_NAME "soundfont.sf3"
        DOWNLOAD_NO_EXTRACT ON
    )
    FetchContent_MakeAvailable(SoundFont)
    set(SoundFont_ROOT "${soundfont_SOURCE_DIR}")
endif()
