include(FetchContent)

FetchContent_Declare(
    iniparser
    URL https://gitlab.com/iniparser/iniparser/-/archive/v4.2.6/iniparser-v4.2.6.zip
    URL_HASH SHA256=BDE4157B131CB0998A14B4B1494B0201876ECEF3D9D93BADF87A1B3C2981084C
    DOWNLOAD_EXTRACT_TIMESTAMP ON
    EXCLUDE_FROM_ALL
)

block()
    set(BUILD_DOCS OFF)
    set(BUILD_SHARED_LIBS OFF)
    FetchContent_MakeAvailable(
        iniparser
    )
endblock()
