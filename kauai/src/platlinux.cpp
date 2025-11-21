/*
 * Linux platform functions
 */

#include "platform.h"
#include <cstdlib>
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
