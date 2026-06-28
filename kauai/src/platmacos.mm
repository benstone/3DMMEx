/*
 * macOS platform functions
 */

#include "platform.h"
#include <cstdlib>
#include <cstring>
#include <cstdio>
#include <stdint.h>
#include <pthread.h>
#include <signal.h>
#include <unistd.h>
#include <mach-o/dyld.h>

#import <Foundation/Foundation.h>

extern "C" void Debugger(void)
{
    raise(SIGTRAP);
}

/***************************************************************************
    Universal scalable application clock and other time stuff
***************************************************************************/

const uint32_t kdtsSecond = 1000;

uint32_t TsCurrentSystem(void)
{
    struct timespec ts;
    static int64_t clockzero_ns;
    int64_t clock_ns;

    clock_gettime(CLOCK_MONOTONIC, &ts);
    clock_ns = ts.tv_sec * 1000000000LL + ts.tv_nsec;

    if (clockzero_ns == 0)
    {
        clockzero_ns = clock_ns - 1000000000LL;
    }

    return (clock_ns - clockzero_ns) / 1000000;
}

uint32_t DtsCaret(void)
{
    return 1000; /* 1s for now */
}

/****************************************
    Current executable name
****************************************/
void GetExecutableName(char *psz, int cchMax)
{
    uint32_t bufsize = cchMax - 1;
    memset(psz, 0, cchMax);

    int ret = _NSGetExecutablePath(psz, &bufsize);
    if (ret != 0)
    {
        NSLog(@"NSGetExecutablePath failed");
        bufsize = 0;
    }
    psz[bufsize] = '\0';
}

/****************************************
    Get environment variable
****************************************/
uint32_t GetEnvironmentVariable(const char *pcszName, char *pszValue, uint32_t cchMax)
{
    char *psz = getenv(pcszName);
    size_t ilen;

    if (psz == NULL)
    {
        return 0;
    }

    ilen = strlen(psz);
    if (ilen >= cchMax)
    {
        ilen = cchMax - 1;
    }

    memcpy(pszValue, psz, ilen);
    pszValue[ilen] = '\0';
    return ilen;
}

/****************************************
    Current username
****************************************/
bool GetUserName(char *psz, int cchMax)
{
    int ires;

    ires = getlogin_r(psz, cchMax);
    if (ires != 0)
    {
        return false;
    }

    return true;
}

/****************************************
    Find a path using NSFileManager
****************************************/
static bool FGetSearchPathDirectory(char *psz, int32_t cchMax, NSSearchPathDirectory whichDir)
{
    @autoreleasepool
    {
        memset(psz, 0, cchMax);

        NSFileManager *fileManager = [NSFileManager defaultManager];
        if (fileManager == nil)
        {
            NSLog(@"Could not get file manager");
            return false;
        }

        // Find the directory
        NSError *error = nil;
        NSURL *directoryUrl = [fileManager URLForDirectory:whichDir
                                                  inDomain:NSUserDomainMask
                                         appropriateForURL:nil
                                                    create:NO
                                                     error:&error];

        if (error)
        {
            NSLog(@"URLForDirectory failed: %@", error.localizedDescription);
            return false;
        }

        // Convert it to a string
        NSString *directoryPath = [directoryUrl path];
        if (directoryPath == nil || ![directoryPath getCString:psz maxLength:cchMax encoding:NSUTF8StringEncoding])
        {
            NSLog(@"Could not convert path to a SZ");
            return false;
        }

        return true;
    }
}

bool FGetDocumentsDir(char *psz, int32_t cchMax)
{
    return FGetSearchPathDirectory(psz, cchMax, NSDocumentDirectory);
}

bool FGetAppConfigDir(char *psz, int32_t cchMax)
{
    return FGetSearchPathDirectory(psz, cchMax, NSApplicationSupportDirectory);
}

bool FGetResourcesDir(char *psz, int32_t cchMax)
{
    @autoreleasepool
    {
        memset(psz, 0, cchMax);

        // Find the resources directory in the bundle
        NSBundle *bundle = [NSBundle mainBundle];
        if (bundle == nil)
        {
            NSLog(@"Failed to get mainBundle");
            return false;
        }

        NSString *resourcesPath = [bundle resourcePath];
        if (resourcesPath == nil || ![resourcesPath getCString:psz maxLength:cchMax encoding:NSUTF8StringEncoding])
        {
            NSLog(@"Failed to convert bundle path to a SZ");
            return false;
        }

        return true;
    }
}