#include <ESP8266WiFi.h>
#include "variables.h"
#include "aws_request.h"
#include "PolledTimeout.h"

using namespace aws_request;

char body[200] = {0};
AWSRequest request(AWSRequestParameters{
    .method = "POST",
    .body = body,
    .host = "sns.ap-southeast-2.amazonaws.com",
    .path = "/",
    .region = "ap-southeast-2",
    .service = "sns",
    .access_key_id = AWS_ACCESS_KEY_ID,
    .secret_access_key = AWS_SECRET_ACCESS_KEY});
unsigned int hello_count = 1;

bool startWiFi()
{
  if (WiFi.status() == WL_CONNECTED)
  {
    Serial.println("[WiFi] Already connected.");
    return true;
  }
  Serial.println("[WiFi] Connecting...");

  WiFi.mode(WIFI_STA);
  WiFi.begin();

  esp8266::polledTimeout::oneShot timeout(30000);
  while (!timeout)
  {
    yield();
    if (WiFi.status() == WL_CONNECTED)
    {
      Serial.printf("[WiFi] Connected to \"%s\".\n", WiFi.SSID().c_str());
      return true;
    }
    else if (WiFi.status() == WL_CONNECT_FAILED)
    {
      Serial.println("[WiFi] Error: Connection failed.");
      return false;
    }
  }
  Serial.printf("[WiFi] Error: Timeout while connecting. Status is %d.\n", WiFi.status());
  return false;
}

void stopWiFi()
{
  WiFi.mode(WIFI_OFF);
}

void setup()
{
  Serial.begin(19200);
  delay(500);
}

void loop()
{
  if (startWiFi())
  {
    Serial.printf("[General] Sending SNS message \"Hello number %u\".\n", hello_count);
    // sprintf(body, "Version=2010-03-31&Action=Publish&TopicArn=arn%3Aaws%3Asns%3Aap-southeast-2%3A605337347611%3Adavis-weather-ingest&Message=Hello number %u", hello_count);
    sprintf(body, "Version=2010-03-31&Action=Publish&TopicArn=arn:aws:sns:ap-southeast-2:605337347611:davis-weather-ingest&Message=Hello number %u", hello_count);
    hello_count += 1;
    AWSResponse response = request.send();
    Serial.printf("[General] Result: %d\n", response.status);

    stopWiFi();
  }
  delay(120000);
}
