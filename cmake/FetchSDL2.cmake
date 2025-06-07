include(FetchContent)
FetchContent_Declare(
  sdl2_windows
  URL https://github.com/libsdl-org/SDL/releases/download/release-2.32.6/SDL2-devel-2.32.6-VC.zip
  DOWNLOAD_EXTRACT_TIMESTAMP ON
)

if(NOT sdl2_windows_POPULATED)
    FetchContent_Populate(sdl2_windows)
    set(ENV{SDL2_DIR} ${sdl2_windows_SOURCE_DIR})
endif()

FetchContent_Declare(
    sdl2_ttf_windows
    URL https://github.com/libsdl-org/SDL_ttf/releases/download/release-2.24.0/SDL2_ttf-devel-2.24.0-VC.zip
    DOWNLOAD_EXTRACT_TIMESTAMP ON
)
if(NOT sdl2_ttf_windows_POPULATED)
    FetchContent_Populate(sdl2_ttf_windows)
    set(ENV{SDL2_ttf_DIR} ${sdl2_ttf_windows_SOURCE_DIR})
endif()