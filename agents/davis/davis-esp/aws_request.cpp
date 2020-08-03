#include "aws_request.h"
#include <ESP8266WiFi.h>
#include <Crypto.h>

// Length of date string YYYYMMDD
#define DATE_LEN 8
// Length of date time string YYYYMMDDThhmmssZ
#define DATE_TIME_LEN 16
// Length in bytes of SHA256 hash
#define HASH_LEN SHA256::NATURAL_LENGTH

namespace aws_request
{
  using namespace experimental::crypto;

  char hex_encode_nibble(uint8_t nibble)
  {
    nibble &= 0xF;
    return nibble > 9 ? nibble - 10 + 'a' : nibble + '0';
  }
  /// Encode bytes from the given array as hex characters.
  /// `length*2+1` bytes will be written at `result` with a NULL terminator byte.
  void hex_encode_array(uint8_t *data, size_t length, char *result)
  {
    for (int i = 0; i < length; ++i)
    {
      result[i * 2] = hex_encode_nibble(data[i] >> 4);
      result[i * 2 + 1] = hex_encode_nibble(data[i]);
    }
    result[length * 2] = 0;
  }

  // parameters: method, path, content-length, host, date_time, hex encoded body hash
  const char *canonical_format = "%s\n%s\n\ncontent-length:%d\ncontent-type:application/x-www-form-urlencoded\nhost:%s\nx-amz-date:%s\n\ncontent-length;content-type;host;x-amz-date\n%s";

  AWSRequest::AWSRequest(AWSRequestParameters parameters, bool validate_cert)
      : parameters(parameters), client(), ntpUDP(), timeClient(ntpUDP, "pool.ntp.org", 0, 7200000), x509(CERT_CA)
  {
    if (validate_cert)
    {
      client.setTrustAnchors(&this->x509);
    }
    else
    {
      this->client.setInsecure();
    }
    this->timeClient.begin();
  }

  void AWSRequest::sign(char *date_time, char *result)
  {
    uint8_t hash_1[HASH_LEN]{0};
    uint8_t hash_2[HASH_LEN]{0};
    size_t body_len = strlen(this->parameters.body);

    // Get hash of the body, hex encode and store it in `result`
    SHA256::hash(this->parameters.body, strlen(this->parameters.body), hash_1);
    hex_encode_array(hash_1, HASH_LEN, result);

    // Allocate enough memory to fit the "canonical request" + NULL
    // Assumes this is also longer than the "string to sign"
    size_t canonical_request_len = snprintf(NULL, 0, canonical_format, this->parameters.method, this->parameters.path, body_len, this->parameters.host, date_time, result);
    char *buffer = (char *)malloc(canonical_request_len + 1);

    // Get hash of the canonical request, hex encode and store it in `result`
    sprintf(buffer, canonical_format, this->parameters.method, this->parameters.path, body_len, this->parameters.host, date_time, result);
    SHA256::hash(buffer, canonical_request_len, hash_1);
    hex_encode_array(hash_1, HASH_LEN, result);

    // Get the string to sign
    size_t to_sign_len = sprintf(buffer, "AWS4-HMAC-SHA256\n%s\n%.8s/%s/%s/aws4_request\n%s", date_time, date_time, this->parameters.region, this->parameters.service, result);

    // Get the signing key
    // hash_1(kDate) = hmac(key = "AWS${secret_access_key}", input = input1)
    char *init_key = buffer + to_sign_len + 1;
    size_t init_key_len = sprintf(init_key, "AWS4%s", this->parameters.secret_access_key);
    SHA256::hmac(date_time, DATE_LEN, init_key, init_key_len, hash_1, HASH_LEN);
    // hash_2(kRegion) = hmac(key = hash_1, input = region)
    SHA256::hmac(this->parameters.region, strlen(this->parameters.region), hash_1, HASH_LEN, hash_2, HASH_LEN);
    // hash_1(kService) = hmac(key = hash_2, input = service)
    SHA256::hmac(this->parameters.service, strlen(this->parameters.service), hash_2, HASH_LEN, hash_1, HASH_LEN);
    // hash_2(kSigning) = hmac(key = hash_1, input = "aws4_request")
    SHA256::hmac("aws4_request", 12, hash_1, HASH_LEN, hash_2, HASH_LEN);

    // Sign the string to sign, hex encode and store the signature in `result`
    SHA256::hmac(buffer, to_sign_len, hash_2, HASH_LEN, hash_1, HASH_LEN);
    hex_encode_array(hash_1, HASH_LEN, result);

    free(buffer);
  }

  AWSResponse AWSRequest::send()
  {
    AWSResponse response = AWSResponse({.status = -1});
    // Get the time
    char date_time[DATE_TIME_LEN + 1] = {0};
    this->timeClient.update();
    time_t timestamp = this->timeClient.getEpochTime();
    struct tm *time_struct = gmtime((long *)&timestamp);
    strftime(date_time, DATE_TIME_LEN + 1, "%Y%m%dT%H%M%SZ", time_struct);
    this->client.setX509Time(timestamp);

    char signature[HASH_LEN * 2 + 1] = {0};
    this->sign(date_time, signature);

    Serial.println("[AWS] Starting connection to server...");
    if (!client.connect(this->parameters.host, 443))
    {
      Serial.println("[AWS] Connection failed!");
      return response;
    }
    Serial.println("[AWS] Connected to server, writing request...");

    client.write(this->parameters.method);
    client.write(" ");
    client.write(this->parameters.path);
    client.write(" HTTP/1.1\r\nHost: ");
    client.write(this->parameters.host);
    client.write("\r\nContent-Type: application/x-www-form-urlencoded\r\nX-Amz-Date: ");
    client.write(date_time);
    client.write("\r\nAuthorization: AWS4-HMAC-SHA256 Credential=");
    client.write(this->parameters.access_key_id);
    client.write("/");
    client.write((const uint8_t *)date_time, DATE_LEN);
    client.write("/");
    client.write(this->parameters.region);
    client.write("/");
    client.write(this->parameters.service);
    client.write("/aws4_request, SignedHeaders=content-length;content-type;host;x-amz-date, Signature=");
    client.write(signature);
    client.write("\r\nConnection: close\r\nContent-Length: ");
    sprintf(signature, "%d", strlen(this->parameters.body));
    client.write(signature);
    client.write("\r\n\r\n");
    client.write(this->parameters.body);

    // Skip the version part of the status line
    while (true)
    {
      char c = client.read();
      if (c == -1)
      {
        return response;
      }
      else if (c == ' ')
      {
        break;
      }
    }
    // Read and parse the status code
    char status_code_string[4] = {0};
    size_t bytes_read = client.readBytes(status_code_string, 3);
    client.stop();
    if (bytes_read == 3)
    {
      int status = atoi(status_code_string);
      if (status != 0)
      {
        response.status = status;
      }
    }
    return response;
  }
} // namespace aws_request
