include(FetchContent)

if (WIN32)
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
elseif(APPLE)
    set(DOWNLOADED_FRAMEWORKS_PATH "${CMAKE_BINARY_DIR}/Frameworks" CACHE PATH "Downloaded frameworks for macOS builds")
    file(MAKE_DIRECTORY "${DOWNLOADED_FRAMEWORKS_PATH}")

    function(fetch_sdl_framework name version sha256 repo)
        if(EXISTS "${DOWNLOADED_FRAMEWORKS_PATH}/${name}.framework")
            return()
        endif()

        message(STATUS "Fetching ${name}")
        string(TOLOWER "${name}_macos" fetch_name)
        FetchContent_Declare(${fetch_name}
            URL "https://github.com/libsdl-org/${repo}/releases/download/release-${version}/${name}-${version}.dmg"
            DOWNLOAD_NO_EXTRACT TRUE
            URL_HASH SHA256=${sha256}
        )
        FetchContent_MakeAvailable(${fetch_name})

        # Mount the disk image and extract the framework from it
        set(mountpoint "${CMAKE_BINARY_DIR}/mnt-${name}")
        execute_process(
            COMMAND hdiutil attach "${${fetch_name}_SOURCE_DIR}/${name}-${version}.dmg"
                    -mountpoint "${mountpoint}" -noautoopen -noverify
            COMMAND_ERROR_IS_FATAL ANY
        )
        file(COPY "${mountpoint}/${name}.framework" DESTINATION "${DOWNLOADED_FRAMEWORKS_PATH}")
        execute_process(
            COMMAND hdiutil detach "${mountpoint}"
            COMMAND_ERROR_IS_FATAL ANY
        )
    endfunction()

    fetch_sdl_framework(SDL2     2.32.10 4a7ac31640d70214e848f994be8a12849c0f97918a7e6c2e27a40036166d1a7f SDL)
    fetch_sdl_framework(SDL2_ttf 2.24.0  677404e23a1a5f6efcbe64697471c5161283e4af5a6403dcb92235d7d83805cd SDL_ttf)

    find_package(SDL2     REQUIRED PATHS "${DOWNLOADED_FRAMEWORKS_PATH}" NO_DEFAULT_PATH)
    find_package(SDL2_ttf REQUIRED PATHS "${DOWNLOADED_FRAMEWORKS_PATH}" NO_DEFAULT_PATH)

else()
    message(FATAL_ERROR "FetchSDL2: unsupported platform")
endif()