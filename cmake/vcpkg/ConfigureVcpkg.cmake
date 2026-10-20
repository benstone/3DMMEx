# Configure dependencies when using vcpkg
cmake_minimum_required(VERSION 3.28)

find_package(SDL2 CONFIG REQUIRED)
find_package(SDL2_ttf CONFIG REQUIRED)

# Add aliases if statically linking SDL2
if(NOT TARGET SDL2::SDL2 AND TARGET SDL2::SDL2-static)
    add_library(SDL2::SDL2 ALIAS SDL2::SDL2-static)
endif()
if(NOT TARGET SDL2_ttf::SDL2_ttf AND TARGET SDL2_ttf::SDL2_ttf-static)
    add_library(SDL2_ttf::SDL2_ttf ALIAS SDL2_ttf::SDL2_ttf-static)
endif()

# Fontconfig requires additional dependencies
find_package(Fontconfig REQUIRED)
find_package(Freetype REQUIRED)
find_package(expat CONFIG REQUIRED)

if(TARGET Fontconfig::Fontconfig)
    set_property(
        TARGET Fontconfig::Fontconfig
        APPEND
        PROPERTY INTERFACE_LINK_LIBRARIES Freetype::Freetype expat::expat
    )
endif()
