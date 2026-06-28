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
else()
    message(WARNING "Cannot download FluidSynth for this platform/compiler")
endif()
