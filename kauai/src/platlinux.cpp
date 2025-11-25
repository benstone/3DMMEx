/*
 * Linux platform functions
 */

#include "platform.h"
#include <cstdlib>
#include <cstring>
#include <stdint.h>
#include <pthread.h>
#include <signal.h>

void Debugger(void)
{
    raise(SIGTRAP);
}

/****************************************
    Mutex (critical section) object
****************************************/

MUTX::MUTX(void)
{
    pthread_mutexattr_t ma;
    pthread_mutex_t *mutx;

    opaque = malloc(sizeof(pthread_mutex_t));
    mutx = (pthread_mutex_t *)opaque;

    pthread_mutexattr_init(&ma);
    pthread_mutexattr_settype(&ma, PTHREAD_MUTEX_RECURSIVE);
    pthread_mutex_init(mutx, &ma);
}

MUTX::~MUTX(void)
{
    pthread_mutex_t *mutx = (pthread_mutex_t *)opaque;

    pthread_mutex_unlock(mutx);
    free(mutx);
}

void MUTX::Enter(void)
{
    pthread_mutex_t *mutx = (pthread_mutex_t *)opaque;

    pthread_mutex_lock(mutx);
}

void MUTX::Leave(void)
{
    pthread_mutex_t *mutx = (pthread_mutex_t *)opaque;

    pthread_mutex_unlock(mutx);
}

/****************************************
    Current thread id
****************************************/
uint32_t LwThreadCur(void)
{
    return (uint32_t)pthread_self();
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
    ssize_t len;

    len = ::readlink("/proc/self/exe", psz, cchMax - 1);
    psz[len] = '\0';
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
    if (ilen > cchMax)
    {
        ilen = cchMax;
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
